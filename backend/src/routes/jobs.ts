import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import {
  getJob,
  insertJob,
  listDocumentsForJob,
  listJobsForUser,
  updateJob,
} from '../db/jobs.js';
import { inngest } from '../inngest/client.js';
import {
  objectExists,
  presignDownload,
  presignUpload,
  zipObjectKey,
} from '../storage/r2.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';
import { withDeadline } from '../util/timeout.js';

const createJobSchema = z.object({
  filename: z.string().min(1).max(256),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
});

const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const DB_DEADLINE_MS = 8_000;
const HANDLER_DEADLINE_MS = 120_000;

export const jobsRoute = new Hono<AuthEnv>();

jobsRoute.use('*', requireAuth);

jobsRoute.post('/', async (c) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('POST /jobs');
  const tStart = Date.now();
  const mark = (label: string) => log.info(`mark: ${label} t+${Date.now() - tStart}ms`);

  const work = (async () => {
    mark('handler entered');

    const body = await c.req.json().catch((e) => {
      log.warn(`body parse failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    mark('body parsed');
    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) {
      log.warn('body validation failed', { issues: parsed.error.flatten() });
      throw new HTTPException(400, { message: 'Invalid body' });
    }
    if (parsed.data.sizeBytes > MAX_ZIP_BYTES) {
      throw new HTTPException(413, { message: 'ZIP too large' });
    }
    if (!parsed.data.filename.toLowerCase().endsWith('.zip')) {
      throw new HTTPException(400, { message: 'Filename must end in .zip' });
    }

    const user = c.get('user');
    const jobId = randomUUID();
    const key = zipObjectKey(user.id, jobId, parsed.data.filename);
    log.info('plan', {
      jobId: jobId.slice(0, 8),
      userId: user.id.slice(0, 8),
      filename: parsed.data.filename,
      sizeBytes: parsed.data.sizeBytes,
    });

    mark('insertJob start');
    const job = await withDeadline(
      insertJob({
        id: jobId,
        user_id: user.id,
        zip_filename: parsed.data.filename,
        zip_size_bytes: parsed.data.sizeBytes,
        zip_storage_key: key,
        status: 'queued',
      }),
      DB_DEADLINE_MS,
      'mongo insertJob',
      log,
    );
    mark('insertJob done');

    mark('presignUpload start');
    const uploadUrl = await withDeadline(
      presignUpload(key, 'application/zip'),
      DB_DEADLINE_MS,
      'r2 presignUpload',
      log,
    );
    mark('presignUpload done');

    return c.json({
      jobId: job.id,
      storageKey: key,
      uploadUrl,
    });
  })();

  return await withDeadline(work, HANDLER_DEADLINE_MS, 'POST /api/jobs handler', log);
});

jobsRoute.post('/:id/start', async (c) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('POST /jobs/:id/start');
  const user = c.get('user');
  const id = c.req.param('id');

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });
  if (job.status !== 'queued') {
    return c.json({ jobId: job.id, status: job.status, alreadyStarted: true });
  }

  const exists = await objectExists(job.zip_storage_key);
  if (!exists) {
    throw new HTTPException(400, { message: 'Upload not found in storage' });
  }

  await updateJob(job.id, { status: 'uploaded', status_detail: 'Queued for analysis' });

  // Fire-and-forget the Inngest event. If delivery fails (no INNGEST_EVENT_KEY,
  // dev server down, network blip), we DON'T fail the user's upload — the job
  // is already in mongo as 'uploaded', and the user can re-trigger the worker
  // later. This avoids a missing/misconfigured Inngest from blocking uploads.
  inngest
    .send({ name: 'pack/uploaded', data: { jobId: job.id } })
    .then(() => log.info('inngest: pack/uploaded delivered'))
    .catch((err) => {
      log.error(`inngest: send failed (workflow won't fire until fixed)`, {
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    });

  return c.json({ jobId: job.id, status: 'uploaded' });
});

jobsRoute.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });

  const documents = await listDocumentsForJob(id);

  const { user_id: _omit, ...publicJob } = job;
  return c.json({
    job: publicJob,
    documents: documents.map((d) => ({
      id: d.id,
      filename: d.filename,
      doc_type: d.doc_type,
      extraction: d.extraction,
      created_at: d.created_at,
    })),
  });
});

jobsRoute.get('/', async (c) => {
  const user = c.get('user');
  const jobs = await listJobsForUser(user.id);
  return c.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      zip_filename: j.zip_filename,
      property_label: j.property_label,
      overall_risk:
        j.report && typeof j.report === 'object' && 'overall_risk' in j.report
          ? (j.report as { overall_risk: string }).overall_risk
          : null,
      created_at: j.created_at,
      updated_at: j.updated_at,
    })),
  });
});

jobsRoute.get('/:id/documents/:docId/url', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const docId = c.req.param('docId');

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });

  const documents = await listDocumentsForJob(id);
  const doc = documents.find((d) => d.id === docId);
  if (!doc) throw new HTTPException(404, { message: 'Document not found' });

  const url = await presignDownload(doc.storage_key);
  return c.json({ url, expiresInSeconds: 60 * 15 });
});
