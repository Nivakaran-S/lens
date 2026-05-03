import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { supabaseAdmin } from './db/supabase.js';

export type AuthUser = { id: string; email?: string };

type Env = { Variables: { user: AuthUser } };

/**
 * Validate a Supabase access token by handing it to the Supabase SDK.
 *
 * We previously used jose + the JWKS endpoint, but that path is brittle:
 *   - Old projects sign with HS256 using a project-wide secret (no JWKS).
 *   - New projects sign with ES256/RS256 via a JWKS endpoint whose path
 *     has changed across Supabase versions.
 *   - The endpoint /auth/v1/keys is not stable for all projects.
 *
 * supabase.auth.getUser(token) handles both schemes, also rejects tokens
 * for banned/deleted users, and adds ~50ms per request — acceptable for
 * the low QPS this API sees.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data?.user) {
      throw new HTTPException(401, { message: 'Invalid token', cause: error ?? undefined });
    }
    c.set('user', { id: data.user.id, email: data.user.email });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('[auth] supabase.auth.getUser failed', err);
    throw new HTTPException(401, { message: 'Invalid token', cause: err });
  }

  await next();
});

export type { Env as AuthEnv };
