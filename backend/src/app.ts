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

const inngestHandler = inngestServe({ client: inngest, functions: [analyzePack] });
app.on(['GET', 'POST', 'PUT'], '/api/inngest', (c) => inngestHandler(c));

app.route('/api/jobs', jobsRoute);
app.route('/api/jobs', chatRoute);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('[unhandled]', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
