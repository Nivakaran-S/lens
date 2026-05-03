import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { serve as inngestServe } from 'inngest/hono';
import { corsOrigins } from './env.js';
import { inngest } from './inngest/client.js';
import { analyzePack } from './inngest/analyze-pack.js';
import { jobsRoute } from './routes/jobs.js';
import { chatRoute } from './routes/chat.js';

export const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
    maxAge: 600,
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, service: 'lens-api', ts: new Date().toISOString() }));

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
