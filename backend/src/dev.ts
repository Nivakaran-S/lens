import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 8788);
// Bind to 0.0.0.0 so the container is reachable from outside on Render.
const hostname = process.env.HOST ?? '0.0.0.0';

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`[lens-api] listening on ${info.address}:${info.port}`);
});
