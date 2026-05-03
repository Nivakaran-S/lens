import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { STORAGE_BUCKET, supabaseAdmin, zipStoragePath } from '../db/supabase.js';
import { getJob, insertJob, listDocumentsForJob, listJobsForUser, updateJob } from '../db/jobs.js';
import { inngest } from '../inngest/client.js';

const createJobSchema = z.object({
  filename: z.string().min(1).max(256),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
});

const MAX_ZIP_BYTES = 100 * 1024 * 1024;

export const jobsRoute = new Hono<AuthEnv>();

jobsRoute.use('*', requireAuth);

jobsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid body' });
  }
  if (parsed.data.sizeBytes > MAX_ZIP_BYTES) {
    throw new HTTPException(413, { message: 'ZIP too large' });
  }
  if (!parsed.data.filename.toLowerCase().endsWith('.zip')) {
    throw new HTTPException(400, { message: 'Filename must end in .zip' });
  }

  const user = c.get('user');

  const job = await insertJob({
    user_id: user.id,
    zip_filename: parsed.data.filename,
    zip_size_bytes: parsed.data.sizeBytes,
    zip_storage_path: 'pending',
    status: 'queued',
  });

  const path = zipStoragePath(user.id, job.id, parsed.data.filename);
  await updateJob(job.id, { zip_storage_path: path });

  const { data: signed, error: signErr } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    throw new HTTPException(500, { message: 'Failed to create upload URL', cause: signErr });
  }

  return c.json({
    jobId: job.id,
    storagePath: path,
    uploadUrl: signed.signedUrl,
    uploadToken: signed.token,
    bucket: STORAGE_BUCKET,
  });
});

jobsRoute.post('/:id/start', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });
  if (job.status !== 'queued') {
    return c.json({ jobId: job.id, status: job.status, alreadyStarted: true });
  }

  const folder = job.zip_storage_path.split('/').slice(0, -1).join('/');
  const expected = job.zip_storage_path.split('/').pop();
  const { data: list } = await supabaseAdmin().storage.from(STORAGE_BUCKET).list(folder);
  const exists = list?.some((f) => f.name === expected);
  if (!exists) {
    throw new HTTPException(400, { message: 'Upload not found in storage' });
  }

  await updateJob(job.id, { status: 'uploaded', status_detail: 'Queued for analysis' });

  await inngest.send({ name: 'pack/uploaded', data: { jobId: job.id } });

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

  const sb = supabaseAdmin();
  const { data: doc, error } = await sb
    .from('documents')
    .select('storage_path, job_id')
    .eq('id', docId)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!doc || (doc as { job_id: string }).job_id !== id) {
    throw new HTTPException(404, { message: 'Document not found' });
  }

  const { data: signed, error: signErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl((doc as { storage_path: string }).storage_path, 60 * 10);

  if (signErr || !signed) {
    throw new HTTPException(500, { message: 'Failed to sign URL', cause: signErr });
  }

  return c.json({ url: signed.signedUrl, expiresInSeconds: 600 });
});
