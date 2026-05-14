import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from './client.js';
import {
  documents,
  jobs,
  type DocumentDoc,
  type JobDoc,
  type JobStatus,
} from './schema.js';

export type { DocumentDoc as DocumentRow, JobDoc as JobRow, JobStatus };

const now = () => new Date().toISOString().slice(0, 23).replace('T', ' ');

/**
 * mysql2 + Drizzle's json() column type sometimes hands back the raw JSON
 * STRING rather than a parsed object — depends on driver version and the
 * `dateStrings: true` connection option we're using. If we don't normalise
 * here, every consumer of `job.report` / `doc.extraction` gets a string and
 * `typeof === 'object'` checks downstream silently fail (frontend shows no
 * report panels, dashboard shows no risk badge, etc.).
 *
 * Always normalise reads from the JSON columns at this single boundary.
 */
function parseJsonField<T>(v: T): T {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v) as T;
  } catch {
    return v;
  }
}

function hydrateJob(row: JobDoc): JobDoc {
  return { ...row, report: parseJsonField(row.report) };
}

function hydrateDocument(row: DocumentDoc): DocumentDoc {
  return { ...row, extraction: parseJsonField(row.extraction) };
}

type JobInsert = {
  id?: string;
  user_id: string;
  zip_storage_key: string;
  zip_filename: string;
  zip_size_bytes?: number | null;
  property_label?: string | null;
  status?: JobStatus;
};

type JobUpdate = Partial<{
  zip_storage_key: string;
  property_label: string | null;
  status: JobStatus;
  status_detail: string | null;
  report: unknown;
  error: string | null;
}>;

export async function insertJob(values: JobInsert): Promise<JobDoc> {
  const id = values.id ?? randomUUID();
  await db().insert(jobs).values({
    id,
    user_id: values.user_id,
    zip_storage_key: values.zip_storage_key,
    zip_filename: values.zip_filename,
    zip_size_bytes: values.zip_size_bytes ?? null,
    property_label: values.property_label ?? null,
    status: values.status ?? 'queued',
    status_detail: null,
    report: null,
    error: null,
  });
  // MariaDB has no RETURNING — re-fetch the row.
  const row = await getJob(id);
  if (!row) throw new Error(`insertJob: row ${id} not found after insert`);
  return row;
}

export async function updateJob(id: string, values: JobUpdate): Promise<void> {
  await db()
    .update(jobs)
    .set({ ...values, updated_at: now() })
    .where(eq(jobs.id, id));
}

export async function getJob(id: string): Promise<JobDoc | null> {
  const rows = await db().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0] ? hydrateJob(rows[0]) : null;
}

export async function listJobsForUser(userId: string, limit = 50): Promise<JobDoc[]> {
  const rows = await db()
    .select()
    .from(jobs)
    .where(eq(jobs.user_id, userId))
    .orderBy(desc(jobs.created_at))
    .limit(limit);
  return rows.map(hydrateJob);
}

export async function listDocumentsForJob(jobId: string): Promise<DocumentDoc[]> {
  const rows = await db()
    .select()
    .from(documents)
    .where(eq(documents.job_id, jobId))
    .orderBy(asc(documents.created_at));
  return rows.map(hydrateDocument);
}

type DocumentInsert = {
  id?: string;
  job_id: string;
  filename: string;
  storage_key: string;
  size_bytes?: number | null;
};

type DocumentUpdate = Partial<{
  gemini_file_uri: string | null;
  gemini_file_uploaded_at: string | null;
  doc_type: string | null;
  extraction: unknown;
}>;

export async function insertDocument(values: DocumentInsert): Promise<DocumentDoc> {
  const id = values.id ?? randomUUID();
  await db().insert(documents).values({
    id,
    job_id: values.job_id,
    filename: values.filename,
    storage_key: values.storage_key,
    size_bytes: values.size_bytes ?? null,
    gemini_file_uri: null,
    gemini_file_uploaded_at: null,
    doc_type: null,
    extraction: null,
  });
  const row = await getDocument(id);
  if (!row) throw new Error(`insertDocument: row ${id} not found after insert`);
  return row;
}

export async function updateDocument(id: string, values: DocumentUpdate): Promise<void> {
  await db().update(documents).set({ ...values }).where(eq(documents.id, id));
}

export async function getDocument(id: string): Promise<DocumentDoc | null> {
  const rows = await db().select().from(documents).where(eq(documents.id, id)).limit(1);
  return rows[0] ? hydrateDocument(rows[0]) : null;
}
