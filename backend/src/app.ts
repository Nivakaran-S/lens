import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { serve as inngestServe } from 'inngest/hono';
import { corsOrigins, envStatus, isOriginAllowed } from './env.js';
import { inngest } from './inngest/client.js';
import { analyzePack } from './inngest/analyze-pack.js';
import { jobsRoute } from './routes/jobs.js';
import { chatRoute } from './routes/chat.js';
import { TimeoutError } from './util/timeout.js';

export const app = new Hono();

app.use('*', logger());
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

/** Probe upstream services with per-call timing — Mongo + R2. */
app.get('/api/diag/services', async (c) => {
  const { mongo } = await import('./db/mongo.js');
  const { presignUpload, objectExists } = await import('./storage/r2.js');

  async function timed<T>(label: string, fn: () => Promise<T>) {
    const t0 = Date.now();
    try {
      await fn();
      return { label, ok: true, ms: Date.now() - t0 };
    } catch (err) {
      return {
        label,
        ok: false,
        ms: Date.now() - t0,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  const results = [
    await timed('mongo_ping', async () => {
      const db = await mongo();
      await db.command({ ping: 1 });
    }),
    await timed('mongo_jobs_count', async () => {
      const db = await mongo();
      await db.collection('jobs').countDocuments({}, { limit: 1 });
    }),
    await timed('r2_presign_upload', async () => {
      await presignUpload(`_diag/${Date.now()}.zip`, 'application/zip');
    }),
    await timed('r2_object_exists_probe', async () => {
      // Returns false (probe key doesn't exist) — we just measure the round trip.
      await objectExists(`_diag/does-not-exist-${Date.now()}.zip`);
    }),
  ];

  return c.json({
    service: 'lens-api',
    results,
    ts: new Date().toISOString(),
  });
});

const inngestHandler = inngestServe({ client: inngest, functions: [analyzePack] });
app.on(['GET', 'POST', 'PUT'], '/api/inngest', (c) => inngestHandler(c));

app.route('/api/jobs', jobsRoute);
app.route('/api/jobs', chatRoute);

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
