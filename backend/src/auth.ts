import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { jwtVerify } from 'jose';
import { env } from './env.js';
import { supabaseAdmin } from './db/supabase.js';
import { withDeadline } from './util/timeout.js';

export type AuthUser = { id: string; email?: string };

type Env = { Variables: { user: AuthUser } };

const AUTH_DEADLINE_MS = 8_000;

let cachedSecret: Uint8Array | null = null;
function jwtSecret(): Uint8Array | null {
  if (cachedSecret) return cachedSecret;
  const raw = env().SUPABASE_JWT_SECRET;
  if (!raw) return null;
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

/**
 * Validate a Supabase access token.
 *
 * Fast path: if SUPABASE_JWT_SECRET is set, verify locally with HS256 (~1ms,
 * no network call). This is the same secret Supabase uses to sign user
 * tokens — copy from Dashboard → Settings → API → "JWT Secret".
 *
 * Fallback: if the secret isn't configured, call supabase.auth.getUser
 * with an 8s hard deadline. Slower (~50–500ms) and prone to internal SDK
 * retry-loops on edge-case tokens, but works without extra config.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  const secret = jwtSecret();

  if (secret) {
    // Fast path — local HS256 verify.
    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        audience: env().SUPABASE_JWT_AUD,
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!sub) throw new Error('JWT missing sub claim');
      const email = typeof payload.email === 'string' ? payload.email : undefined;
      c.set('user', { id: sub, email });
      await next();
      return;
    } catch (err) {
      console.error('[auth] local JWT verify failed', err);
      throw new HTTPException(401, { message: 'Invalid token', cause: err });
    }
  }

  // Fallback path — network round-trip via SDK.
  const t0 = Date.now();
  try {
    console.log('[auth] calling supabase.auth.getUser (no JWT_SECRET set)');
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
    const status = err instanceof Error && err.name === 'TimeoutError' ? 503 : 401;
    throw new HTTPException(status, {
      message: status === 503 ? 'Auth verification timed out' : 'Invalid token',
      cause: err,
    });
  }

  await next();
});

export type { Env as AuthEnv };
