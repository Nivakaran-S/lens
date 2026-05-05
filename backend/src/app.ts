import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { corsOrigins, envStatus, isOriginAllowed } from './env.js';
import { adminRoute } from './routes/admin.js';
import { checkoutRoute } from './routes/checkout.js';
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

/** Probe upstream services with per-call timing — Mongo + R2. */
app.get('/api/diag/services', async (c) => {
  const { mongo } = await import('./db/mongo.js');
  const { presignUpload } = await import('./storage/r2.js');
  const { GetObjectCommand, HeadBucketCommand, S3Client } = await import('@aws-sdk/client-s3');
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
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.R2_ACCESS_KEY_ID,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    },
  });

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
    // This one ACTUALLY exercises the credentials by talking to R2.
    // Wrong key → 'InvalidAccessKeyId' or 'SignatureDoesNotMatch'.
    // Wrong bucket → 'NoSuchBucket'.
    // Right key + wrong region → 'Forbidden'.
    await timed('r2_head_bucket', async () => {
      await r2.send(new HeadBucketCommand({ Bucket: e.R2_BUCKET }));
    }),
    // Probe a known-missing object — expect NoSuchKey on success path.
    await timed('r2_get_missing_object', async () => {
      try {
        await r2.send(
          new GetObjectCommand({
            Bucket: e.R2_BUCKET,
            Key: `_diag/does-not-exist-${Date.now()}.zip`,
          }),
        );
      } catch (err) {
        // NoSuchKey here is the expected, healthy response.
        const name = err instanceof Error ? err.name : '';
        if (name === 'NoSuchKey') return; // success — credentials worked, key just doesn't exist
        throw err;
      }
    }),
  ];

  return c.json({
    service: 'lens-api',
    bucket: e.R2_BUCKET,
    accessKeyIdPrefix: e.R2_ACCESS_KEY_ID.slice(0, 6) + '…',
    accessKeyIdLength: e.R2_ACCESS_KEY_ID.length,
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
