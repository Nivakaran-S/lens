import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { corsOrigins, envStatus, isOriginAllowed } from './env.js';
import { adminRoute } from './routes/admin.js';
import { checkoutRoute } from './routes/checkout.js';
import { filesRoute } from './routes/files.js';
import { jobsRoute } from './routes/jobs.js';
import { meRoute } from './routes/me.js';
import { packagesRoute } from './routes/packages.js';
import { stripeRoute } from './routes/stripe.js';
import { requestLogger } from './util/log.js';
import { TimeoutError } from './util/timeout.js';

export const app = new Hono();

app.use('*', requestLogger);
app.use(
  '*',
  cors({
    origin: (origin) => (isOriginAllowed(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
    maxAge: 600,
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, service: 'lens-api', ts: new Date().toISOString() }));

app.get('/api/diag', (c) => {
  return c.json({
    service: 'lens-api',
    runtime: { node: process.version },
    env: envStatus(),
    cors: {
      origins: corsOrigins(),
      requestOrigin: c.req.header('origin') ?? null,
      requestOriginAllowed: isOriginAllowed(c.req.header('origin')),
    },
    ts: new Date().toISOString(),
  });
});

/** Probe upstream services with per-call timing — Postgres + uploads disk. */
app.get('/api/diag/services', async (c) => {
  const { ping } = await import('./db/client.js');
  const { promises: fsp, constants: fsConst } = await import('node:fs');
  const { env } = await import('./env.js');

  async function timed<T>(label: string, fn: () => Promise<T>) {
    const t0 = Date.now();
    try {
      const value = await fn();
      return { label, ok: true, ms: Date.now() - t0, ...(value !== undefined ? { value } : {}) };
    } catch (err) {
      return {
        label,
        ok: false,
        ms: Date.now() - t0,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  const e = env();

  const results = [
    await timed('pg_ping', async () => {
      await ping();
    }),
    await timed('uploads_dir_writable', async () => {
      await fsp.access(e.UPLOAD_DIR, fsConst.R_OK | fsConst.W_OK);
    }),
    await timed('uploads_disk_free', async () => {
      // statfs is Node 18+. Returns block info; compute free bytes.
      const statfs = (fsp as unknown as {
        statfs?: (p: string) => Promise<{ bsize: number; bavail: number; blocks: number }>;
      }).statfs;
      if (!statfs) return { note: 'fs.promises.statfs unavailable on this Node version' };
      const s = await statfs(e.UPLOAD_DIR);
      const freeBytes = s.bsize * s.bavail;
      const totalBytes = s.bsize * s.blocks;
      return {
        free_bytes: freeBytes,
        total_bytes: totalBytes,
        free_pct: totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 100) : null,
      };
    }),
  ];

  return c.json({
    service: 'lens-api',
    upload_dir: e.UPLOAD_DIR,
    results,
    ts: new Date().toISOString(),
  });
});

// Stripe webhook MUST come before any other middleware that mutates the body.
// requestLogger is fine (read-only); cors() is also fine because Stripe's
// servers don't trigger preflight. We mount stripeRoute alongside the others
// — it relies on the raw body via c.req.text() which Hono lets us read
// regardless of upstream middleware.
app.route('/api/stripe', stripeRoute);

app.route('/api/me', meRoute);
app.route('/api/jobs', jobsRoute);
app.route('/api/packages', packagesRoute);
app.route('/api/payment-intent', checkoutRoute);
app.route('/api/admin', adminRoute);
// Signed-download endpoint — auth is the HMAC signature, not a JWT.
// Mount LAST so other routes match first.
app.route('/api/files', filesRoute);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof TimeoutError) {
    console.error('[timeout]', err.message);
    return c.json({ error: err.message }, 503);
  }
  console.error('[unhandled]', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
