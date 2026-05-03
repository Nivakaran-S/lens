import { randomUUID } from 'node:crypto';
import {
  chatMessagesCollection,
  documentsCollection,
  ensureIndexes,
  jobsCollection,
  type ChatMessageDoc,
  type DocumentDoc,
  type JobDoc,
  type JobStatus,
} from './mongo.js';

export type { ChatMessageDoc as ChatMessageRow, DocumentDoc as DocumentRow, JobDoc as JobRow, JobStatus };

const now = () => new Date().toISOString();

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

function stripId<T extends object>(doc: T | null): T | null {
  if (!doc) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const copy = { ...(doc as any) };
  delete copy._id;
  return copy as T;
}

export async function insertJob(values: JobInsert): Promise<JobDoc> {
  const jobs = await jobsCollection();
  await ensureIndexes();
  const id = values.id ?? randomUUID();
  const ts = now();
  const doc: JobDoc = {
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
    created_at: ts,
    updated_at: ts,
  };
  await jobs.insertOne(doc);
  return doc;
}

export async function updateJob(id: string, values: JobUpdate): Promise<void> {
  const jobs = await jobsCollection();
  const $set: Record<string, unknown> = { ...values, updated_at: now() };
  await jobs.updateOne({ id }, { $set });
}

export async function getJob(id: string): Promise<JobDoc | null> {
  const jobs = await jobsCollection();
  const doc = await jobs.findOne({ id });
  return stripId(doc) as JobDoc | null;
}

export async function listJobsForUser(userId: string, limit = 50): Promise<JobDoc[]> {
  const jobs = await jobsCollection();
  const cursor = jobs
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit);
  const out: JobDoc[] = [];
  for await (const doc of cursor) {
    out.push(stripId(doc) as JobDoc);
  }
  return out;
}

export async function listDocumentsForJob(jobId: string): Promise<DocumentDoc[]> {
  const docs = await documentsCollection();
  const cursor = docs.find({ job_id: jobId }).sort({ created_at: 1 });
  const out: DocumentDoc[] = [];
  for await (const d of cursor) out.push(stripId(d) as DocumentDoc);
  return out;
}

export async function listChatMessages(jobId: string): Promise<ChatMessageDoc[]> {
  const chats = await chatMessagesCollection();
  const cursor = chats.find({ job_id: jobId }).sort({ created_at: 1 });
  const out: ChatMessageDoc[] = [];
  for await (const m of cursor) out.push(stripId(m) as ChatMessageDoc);
  return out;
}

export async function insertChatMessage(
  jobId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const chats = await chatMessagesCollection();
  await chats.insertOne({
    id: randomUUID(),
    job_id: jobId,
    role,
    content,
    created_at: now(),
  });
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
  const docs = await documentsCollection();
  await ensureIndexes();
  const id = values.id ?? randomUUID();
  const doc: DocumentDoc = {
    id,
    job_id: values.job_id,
    filename: values.filename,
    storage_key: values.storage_key,
    size_bytes: values.size_bytes ?? null,
    gemini_file_uri: null,
    gemini_file_uploaded_at: null,
    doc_type: null,
    extraction: null,
    created_at: now(),
  };
  await docs.insertOne(doc);
  return doc;
}

export async function updateDocument(id: string, values: DocumentUpdate): Promise<void> {
  const docs = await documentsCollection();
  await docs.updateOne({ id }, { $set: { ...values } });
}

export async function getDocument(id: string): Promise<DocumentDoc | null> {
  const docs = await documentsCollection();
  const doc = await docs.findOne({ id });
  return stripId(doc) as DocumentDoc | null;
}
