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

// Diagnostic endpoint: reports which env vars the running function actually
// receives. NEVER reveals values, only presence — safe to expose. Use this to
// verify a Vercel deploy picked up the dashboard env vars.
app.get('/api/diag', (c) => {
  const status = envStatus();
  return c.json({
    service: 'lens-api',
    runtime: { node: process.version },
    env: status,
    // SUPABASE_URL is not a secret — it's already in every browser bundle.
    // Service-role / anon keys remain presence-only.
    supabase_url: process.env.SUPABASE_URL ?? null,
    cors: {
      origins: corsOrigins(),
      requestOrigin: c.req.header('origin') ?? null,
      requestOriginAllowed: isOriginAllowed(c.req.header('origin')),
    },
    ts: new Date().toISOString(),
  });
});

/**
 * Probes connectivity from this function out to Supabase. Times each call
 * individually so we can see which leg (DNS, auth API, REST API, Storage API)
 * is the bottleneck. Public — does not reveal data, only timing/error shapes.
 */
app.get('/api/diag/supabase', async (c) => {
  // Lazy import so /api/health and /api/diag still work if env() throws.
  const { supabaseAdmin } = await import('./db/supabase.js');

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

  let sb;
  try {
    sb = supabaseAdmin();
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        hint: 'supabaseAdmin() failed — likely missing SUPABASE_URL / SERVICE_ROLE_KEY',
      },
      500,
    );
  }

  const results = [
    await timed('rest_jobs_count', async () => {
      const { error } = await sb.from('jobs').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
    }),
    await timed('auth_get_user_invalid', async () => {
      // Expect this to FAIL (invalid token) — we just want to know how fast.
      await sb.auth.getUser('invalid.token.value');
    }),
    await timed('storage_list_root', async () => {
      const { error } = await sb.storage.from('legal-packs').list('', { limit: 1 });
      if (error && !/not.found/i.test(error.message)) throw new Error(error.message);
    }),
    await timed('storage_create_signed_upload_url', async () => {
      // Same shape as POST /api/jobs: a path that doesn't yet exist in storage.
      const probePath = `_diag/${Date.now()}-${Math.random().toString(36).slice(2)}.zip`;
      const { error } = await sb.storage.from('legal-packs').createSignedUploadUrl(probePath);
      if (error) throw new Error(error.message);
    }),
  ];

  return c.json({
    service: 'lens-api',
    supabase_url: process.env.SUPABASE_URL ?? null,
    fetch_timeout_ms: 15_000,
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
