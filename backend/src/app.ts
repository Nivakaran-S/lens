import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { corsOrigins, env, envStatus, isOriginAllowed } from './env.js';
import { adminRoute } from './routes/admin.js';
import { authRoute } from './routes/auth.js';
import { checkoutRoute } from './routes/checkout.js';
import { filesRoute } from './routes/files.js';
import { jobsRoute } from './routes/jobs.js';
import { meRoute } from './routes/me.js';
import { packagesRoute } from './routes/packages.js';
import { stripeRoute } from './routes/stripe.js';
import { logger as fallbackLogger, requestLogger, type Logger } from './util/log.js';
import { TimeoutError } from './util/timeout.js';

export const app = new Hono();

app.use('*', requestLogger);
app.use(
  '*',
  cors({
    origin: (origin) => (isOriginAllowed(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type'],
    // credentials: true tells the browser to send cookies (the session cookie)
    // with cross-origin requests, AND lets the response set cookies. Required
    // for our cookie-based session auth across the frontend↔api split-domain.
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

/**
 * Diagnostic — synchronously tests SMTP by sending a tiny test message to
 * the address in the `to` query string. Returns 200 with the accepted/
 * rejected lists and SMTP response, or 500 with the verbatim SMTP error.
 *
 * Only enabled when DEBUG_ERRORS=true so this can't be abused to spam.
 * Pass ?to=you@example.com (defaults to SMTP_FROM if omitted).
 */
app.get('/api/diag/email', async (c) => {
  const e = env();
  if (!e.DEBUG_ERRORS) {
    return c.json({ error: 'Set DEBUG_ERRORS=true on the server to enable.' }, 403);
  }
  const to = c.req.query('to') ?? e.SMTP_FROM;
  const { sendTestEmail } = await import('./auth/email.js');
  try {
    const result = await sendTestEmail({ to });
    return c.json({
      ok: true,
      to,
      smtp: {
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        user: e.SMTP_USER,
        from: e.SMTP_FROM,
      },
      result,
    });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = err as any;
    return c.json(
      {
        ok: false,
        to,
        smtp: {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          user: e.SMTP_USER,
          from: e.SMTP_FROM,
        },
        error: {
          name: x?.name,
          message: x?.message,
          code: x?.code,
          command: x?.command,
          response: x?.response,
          responseCode: x?.responseCode,
        },
      },
      500,
    );
  }
});

// Stripe webhook MUST come before any other middleware that mutates the body.
// requestLogger is fine (read-only); cors() is also fine because Stripe's
// servers don't trigger preflight. We mount stripeRoute alongside the others
// — it relies on the raw body via c.req.text() which Hono lets us read
// regardless of upstream middleware.
app.route('/api/stripe', stripeRoute);

app.route('/api/auth', authRoute);
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

  // Unhandled. Log every piece of context so the operator doesn't have to
  // guess which route, request, or call threw. Uses the per-request logger
  // (which carries reqId) when available, otherwise a fresh one.
  const log = (c.get('log' as never) as Logger | undefined) ?? fallbackLogger('unhandled');
  const errInfo = extractErrorInfo(err);
  log.error('[unhandled]', {
    method: c.req.method,
    path: c.req.path,
    ...errInfo,
  });

  // In debug mode, surface the cause in the response body too. Off in
  // production unless DEBUG_ERRORS=true is explicitly set on the host.
  if (env().DEBUG_ERRORS) {
    return c.json({ error: 'Internal Server Error', ...errInfo }, 500);
  }
  return c.json({ error: 'Internal Server Error' }, 500);
});

/**
 * Pull as much detail as possible out of an unknown error, including
 * mysql2-specific fields (code, errno, sqlMessage, sqlState) and the
 * ES2022 chained `cause` when present. Drizzle wraps mysql errors with a
 * "Failed query: ..." message, so the real cause is usually one level deep.
 */
function extractErrorInfo(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { value: String(err) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const info: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  for (const k of ['code', 'errno', 'sqlMessage', 'sqlState', 'constraint']) {
    if (e[k] !== undefined) info[k] = e[k];
  }
  if (err.cause) {
    info.cause = extractErrorInfo(err.cause);
  }
  return info;
}

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
