import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { supabaseAdmin } from './db/supabase.js';
import { withDeadline } from './util/timeout.js';

export type AuthUser = { id: string; email?: string };

type Env = { Variables: { user: AuthUser } };

const AUTH_DEADLINE_MS = 8_000;

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  const t0 = Date.now();
  try {
    console.log('[auth] calling supabase.auth.getUser');
    const { data, error } = await withDeadline(
      supabaseAdmin().auth.getUser(token),
      AUTH_DEADLINE_MS,
      'supabase.auth.getUser',
    );
    console.log(`[auth] getUser done in ${Date.now() - t0}ms, error=${!!error}`);
    if (error || !data?.user) {
      throw new HTTPException(401, { message: 'Invalid token', cause: error ?? undefined });
    }
    c.set('user', { id: data.user.id, email: data.user.email });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error(`[auth] supabase.auth.getUser failed after ${Date.now() - t0}ms`, err);
    // 503 for upstream timeouts so the client knows it's not their fault.
    const status = err instanceof Error && err.name === 'TimeoutError' ? 503 : 401;
    throw new HTTPException(status, {
      message: status === 503 ? 'Auth verification timed out' : 'Invalid token',
      cause: err,
    });
  }

  await next();
});

export type { Env as AuthEnv };
