import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
import {
  absolutePath,
  objectExists,
  signedDownloadUrl,
  zipObjectKey,
} from '../storage/fs.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';
import { withDeadline } from '../util/timeout.js';
import { runAnalysis } from '../worker/analyse.js';
import { deductCredits } from '../db/users.js';
import { env } from '../env.js';

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
      'pg insertJob',
      log,
    );
    mark('insertJob done');

    // Upload now goes through THIS backend (multipart POST) instead of a
    // browser-direct PUT to R2. Return the relative path; the frontend
    // appends it to its API base URL.
    const uploadUrl = `/api/jobs/${job.id}/upload`;

    return c.json({
      jobId: job.id,
      storageKey: key,
      uploadUrl,
    });
  })();

  return await withDeadline(work, HANDLER_DEADLINE_MS, 'POST /api/jobs handler', log);
});

/**
 * POST /api/jobs/:id/upload — multipart/form-data with a single field "file".
 *
 * Streams the body to a temp file, validates ZIP magic bytes + size, then
 * atomically renames into place. Atomic-rename guarantees that
 * objectExists() never sees a half-finished upload.
 */
jobsRoute.post('/:id/upload', async (c) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('POST /jobs/:id/upload');
  const user = c.get('user');
  const id = c.req.param('id');

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });
  if (job.status !== 'queued') {
    throw new HTTPException(409, {
      message: `Cannot upload to job in status "${job.status}"`,
    });
  }

  // parseBody pulls the multipart payload into memory. For 100 MB files
  // we want streaming, so we pipe c.req.raw.body directly. Hono's parseBody
  // would buffer the entire file.
  //
  // Multipart parsing inline: minimal state machine that finds the file
  // part's body bounds. To keep things simple and avoid pulling a parser
  // dep, we accept either:
  //   (a) Content-Type: multipart/form-data with a single "file" field, OR
  //   (b) Content-Type: application/zip with the raw bytes as the body.
  // Most browsers send (a); curl/scripts often use (b). Both work.
  const finalAbs = absolutePath(job.zip_storage_key);
  await fsp.mkdir(path.dirname(finalAbs), { recursive: true });
  const tmpAbs = `${finalAbs}.${randomUUID().slice(0, 8)}.part`;

  const ctype = (c.req.header('content-type') ?? '').toLowerCase();
  let bytesWritten = 0;

  try {
    if (ctype.startsWith('application/zip') || ctype.startsWith('application/octet-stream')) {
      // Raw body — straight stream-to-disk.
      bytesWritten = await streamRequestToFile(c.req.raw, tmpAbs);
    } else if (ctype.startsWith('multipart/form-data')) {
      // Use Hono's parseBody for simplicity. Yes it buffers — at 100 MB
      // ceiling we'll allocate up to ~100 MB transiently. Acceptable for
      // this size and avoids a bespoke multipart parser.
      const form = await c.req.parseBody({ all: false });
      const file = form['file'];
      if (!file || !(file instanceof File)) {
        throw new HTTPException(400, { message: 'Missing "file" field' });
      }
      const ab = await file.arrayBuffer();
      await fsp.writeFile(tmpAbs, Buffer.from(ab));
      bytesWritten = ab.byteLength;
    } else {
      throw new HTTPException(415, {
        message: 'Expected multipart/form-data or application/zip',
      });
    }

    if (bytesWritten > MAX_ZIP_BYTES) {
      throw new HTTPException(413, { message: 'ZIP too large' });
    }
    if (bytesWritten === 0) {
      throw new HTTPException(400, { message: 'Empty upload' });
    }

    // Verify ZIP magic bytes (PK\x03\x04). Cheap — read 4 bytes.
    const fh = await fsp.open(tmpAbs, 'r');
    try {
      const head = Buffer.alloc(4);
      await fh.read(head, 0, 4, 0);
      if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
        throw new HTTPException(400, { message: 'Not a valid ZIP file' });
      }
    } finally {
      await fh.close();
    }

    // Atomic move into place.
    await fsp.rename(tmpAbs, finalAbs);

    log.info(`uploaded ${bytesWritten} bytes to ${job.zip_storage_key.slice(0, 40)}…`);
    return c.json({ ok: true, bytes: bytesWritten });
  } catch (err) {
    // Best-effort cleanup of the partial file.
    fsp.rm(tmpAbs, { force: true }).catch(() => {});
    if (err instanceof HTTPException) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    log.error('upload failed', { error: msg });
    throw new HTTPException(500, { message: `Upload failed: ${msg}` });
  }
});

async function streamRequestToFile(req: Request, abs: string): Promise<number> {
  if (!req.body) throw new HTTPException(400, { message: 'Empty request body' });
  const ws = createWriteStream(abs);
  let bytes = 0;
  // Wrap the WebReadableStream → Node Readable. Node 18+ has Readable.fromWeb.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeReadable = Readable.fromWeb(req.body as any);
  nodeReadable.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
  });
  await pipeline(nodeReadable, ws);
  return bytes;
}

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

  // Deduct credits BEFORE marking the job uploaded so we never start work
  // the user can't pay for. deductCredits is atomic: if the user doesn't
  // have enough, no charge is made and we return 402 here.
  // runAnalysis automatically refunds on failure so transient errors don't
  // burn the user's credits.
  const cost = env().COST_PER_ANALYSIS;
  const charge = await deductCredits(user.id, cost, {
    source: 'analysis_charge',
    note: `Charge for analysis ${job.id}`,
  });
  if (!charge.ok) {
    log.warn('insufficient credits', {
      sub: user.id.slice(0, 8),
      balance: charge.balance,
      needed: cost,
    });
    throw new HTTPException(402, {
      message: `Insufficient credits (have ${charge.balance}, need ${cost})`,
    });
  }
  log.info(`charged ${cost} credit(s); balance=${charge.balance}`);

  await updateJob(job.id, { status: 'uploaded', status_detail: 'Queued for analysis' });

  // Fire-and-forget the analysis pipeline. The handler returns immediately;
  // runAnalysis updates job.status as it works. On failure, runAnalysis
  // refunds the credit so the user isn't charged for failed parses.
  runAnalysis(job.id, log.child(job.id.slice(0, 8))).catch((err) => {
    log.error('runAnalysis unexpected throw', {
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

  const url = signedDownloadUrl(doc.storage_key);
  return c.json({ url, expiresInSeconds: env().FILE_SIGN_TTL_SECONDS });
});
