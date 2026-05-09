import { accessSync, constants as fsConst } from 'node:fs';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './env.js';
import { ping } from './db/client.js';

async function bootstrap() {
  const e = env();

  // Fail fast on misconfiguration so the operator sees the real cause at
  // startup, not on the first request.
  try {
    accessSync(e.UPLOAD_DIR, fsConst.R_OK | fsConst.W_OK);
  } catch {
    console.error(
      `[lens-api] UPLOAD_DIR not readable/writable: ${e.UPLOAD_DIR}. ` +
        `Create the directory and chown to the Node process user.`,
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && !e.PUBLIC_API_URL.startsWith('https://')) {
    console.error(
      `[lens-api] PUBLIC_API_URL must be https:// in production (got "${e.PUBLIC_API_URL}")`,
    );
    process.exit(1);
  }

  try {
    await ping();
  } catch (err) {
    console.error(
      `[lens-api] Postgres connectivity check failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 8788);
  const hostname = process.env.HOST ?? '0.0.0.0';

  serve({ fetch: app.fetch, port, hostname }, (info) => {
    console.log(`[lens-api] listening on ${info.address}:${info.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[lens-api] bootstrap failed', err);
  process.exit(1);
});
