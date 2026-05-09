import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

// ── Key helpers — unchanged shape from the R2 era ─────────────────────
// Storage keys remain "{userId}/{jobId}/..." so swapping the backend
// doesn't change any persisted storage_key values in the DB.

export function zipObjectKey(userId: string, jobId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `${userId}/${jobId}/${safe}`;
}

export function pdfObjectKey(
  userId: string,
  jobId: string,
  index: number,
  filename: string,
): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `${userId}/${jobId}/docs/${String(index).padStart(2, '0')}-${safe}`;
}

// ── Path resolution with traversal guard ──────────────────────────────
//
// Every read/write must go through resolveKey() so a malicious or buggy
// caller can't escape UPLOAD_DIR with a `../...` key.
function resolveKey(key: string): string {
  const root = path.resolve(env().UPLOAD_DIR);
  const abs = path.resolve(root, key);
  // Require the resolved path to live inside UPLOAD_DIR. Trailing `path.sep`
  // prevents `/uploads-other` from satisfying startsWith('/uploads').
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`storage: key escapes UPLOAD_DIR: ${key}`);
  }
  return abs;
}

// ── Read / write / probe ──────────────────────────────────────────────

export async function getObjectBuffer(key: string): Promise<Buffer> {
  return fsp.readFile(resolveKey(key));
}

export async function putObject(key: string, body: Buffer, _contentType?: string): Promise<void> {
  const abs = resolveKey(key);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, body);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await fsp.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

// ── Signed download URL — HMAC over (key + exp) ───────────────────────
//
// Replaces R2's presignDownload. The download endpoint at
// GET /api/files/<key>?exp=<unix>&sig=<hex> in routes/files.ts verifies
// these. The signature input uses a newline separator so a hostile client
// can't smuggle a different key by reordering / concatenating params.

export type SignedUrlOptions = { ttlSeconds?: number };

function signatureInput(key: string, exp: number): string {
  return `${key}\n${exp}`;
}

export function signKey(key: string, exp: number): string {
  return createHmac('sha256', env().FILE_SIGN_SECRET)
    .update(signatureInput(key, exp))
    .digest('hex');
}

/**
 * Verify an HMAC signature in constant time. Returns true only if the
 * signature matches AND the URL hasn't expired. Used by routes/files.ts.
 */
export function verifySignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;
  const expected = signKey(key, exp);
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Build a download URL valid for `ttlSeconds` (default: env's
 * FILE_SIGN_TTL_SECONDS, currently 15 min). Returns an absolute URL using
 * PUBLIC_API_URL as the origin.
 */
export function signedDownloadUrl(key: string, opts: SignedUrlOptions = {}): string {
  const e = env();
  const ttl = opts.ttlSeconds ?? e.FILE_SIGN_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = signKey(key, exp);
  const origin = e.PUBLIC_API_URL.replace(/\/+$/, '');
  // The key contains slashes — leave them; the route uses a wildcard
  // segment so the path naturally encodes the structure. Encode each
  // segment so spaces/unicode in filenames are safe.
  const encoded = key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${origin}/api/files/${encoded}?exp=${exp}&sig=${sig}`;
}

/**
 * Resolve a key to an absolute path. Re-exposed for routes/files.ts.
 * Always run a path-traversal check via resolveKey().
 */
export function absolutePath(key: string): string {
  return resolveKey(key);
}

/**
 * Look up file size + presence. Returns null if missing.
 */
export async function statKey(key: string): Promise<{ size: number } | null> {
  try {
    const s = await fsp.stat(resolveKey(key));
    return { size: s.size };
  } catch {
    return null;
  }
}
