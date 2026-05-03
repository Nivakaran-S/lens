import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env.js';

const PRESIGN_TTL_SECONDS = 60 * 15; // 15 min — generous for slow networks

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const e = env();
  cached = new S3Client({
    region: 'auto',
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.R2_ACCESS_KEY_ID,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

function bucket(): string {
  return env().R2_BUCKET;
}

export function zipObjectKey(userId: string, jobId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `${userId}/${jobId}/${safe}`;
}

export function pdfObjectKey(userId: string, jobId: string, index: number, filename: string): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `${userId}/${jobId}/docs/${String(index).padStart(2, '0')}-${safe}`;
}

/**
 * Presigned PUT URL the browser uses to upload the ZIP directly to R2.
 * The frontend does `fetch(url, { method: 'PUT', body: file })` — no auth
 * header needed; the URL itself is the credential.
 */
export async function presignUpload(key: string, contentType = 'application/zip'): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/**
 * Presigned GET URL for downloading or viewing an object. Used by the frontend's
 * "View PDF" link in the document list.
 */
export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

/**
 * Server-side fetch of an object's bytes. Used by the Inngest workflow to
 * stream a ZIP into adm-zip and to re-upload PDFs to Gemini File API after
 * the 48h URI expiry.
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out: GetObjectCommandOutput = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!out.Body) throw new Error(`R2 object body missing for key=${key}`);
  const body = out.Body as { transformToByteArray: () => Promise<Uint8Array> };
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Server-side upload of a buffer to R2. Used by the Inngest workflow to stage
 * each extracted PDF.
 */
export async function putObject(key: string, body: Buffer, contentType = 'application/pdf'): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

/**
 * Lightweight existence probe used by /api/jobs/:id/start to confirm the
 * browser actually finished its presigned PUT before we kick off the worker.
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: 'bytes=0-0' }));
    return true;
  } catch {
    return false;
  }
}
