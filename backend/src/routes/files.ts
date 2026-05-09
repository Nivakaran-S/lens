import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { stream } from 'hono/streaming';
import { absolutePath, statKey, verifySignature } from '../storage/fs.js';

export const filesRoute = new Hono();

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * GET /api/files/<key>?exp=<unix>&sig=<hex>
 *
 * The signature is the auth — no requireAuth middleware. The key is a
 * relative storage path like "<userId>/<jobId>/<filename>.zip" or
 * "<userId>/<jobId>/docs/<n>-<filename>.pdf".
 *
 * Path-traversal is handled inside storage/fs.ts (absolutePath enforces
 * the UPLOAD_DIR boundary). The signature covers the full key so a
 * tampered key won't verify.
 */
filesRoute.get('/*', async (c) => {
  // Hono URL after the route mount: c.req.path is "/api/files/<key>".
  // Strip the prefix, keep the rest as the (URL-encoded) key.
  const fullPath = c.req.path; // e.g. "/api/files/<userId>/<jobId>/<file>"
  const prefix = '/api/files/';
  if (!fullPath.startsWith(prefix)) {
    throw new HTTPException(400, { message: 'Bad files request' });
  }
  const encodedKey = fullPath.slice(prefix.length);
  if (!encodedKey) throw new HTTPException(400, { message: 'Missing key' });

  // Decode each segment — the URL was built with encodeURIComponent per segment.
  const key = encodedKey
    .split('/')
    .map((seg) => decodeURIComponent(seg))
    .join('/');

  const expRaw = c.req.query('exp');
  const sig = c.req.query('sig');
  if (!expRaw || !sig) throw new HTTPException(400, { message: 'Missing exp or sig' });

  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp)) throw new HTTPException(400, { message: 'Bad exp' });

  if (!verifySignature(key, exp, sig)) {
    throw new HTTPException(403, { message: 'Invalid or expired signature' });
  }

  // resolveKey enforces the UPLOAD_DIR boundary. Throws on traversal attempts.
  let abs: string;
  try {
    abs = absolutePath(key);
  } catch {
    throw new HTTPException(400, { message: 'Invalid key' });
  }

  const stat = await statKey(key);
  if (!stat) throw new HTTPException(404, { message: 'File not found' });

  const filename = path.basename(abs);
  const mime = mimeFor(filename);

  c.header('Content-Type', mime);
  c.header('Content-Length', String(stat.size));
  c.header('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
  c.header('Cache-Control', 'private, max-age=60');

  return stream(c, async (out) => {
    const rs = createReadStream(abs);
    for await (const chunk of rs) {
      await out.write(chunk as Buffer);
    }
  });
});
