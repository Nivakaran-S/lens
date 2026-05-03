import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { env } from './env.js';

export type AuthUser = { id: string; email?: string };

type Env = { Variables: { user: AuthUser } };

let cachedJwks: JWTVerifyGetKey | null = null;
function jwks(): JWTVerifyGetKey {
  if (cachedJwks) return cachedJwks;
  const e = env();
  cachedJwks = createRemoteJWKSet(new URL(`${e.SUPABASE_URL}/auth/v1/keys`));
  return cachedJwks;
}

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  try {
    const { payload } = await jwtVerify(token, jwks(), {
      audience: env().SUPABASE_JWT_AUD,
    });
    const sub = payload.sub;
    if (!sub) throw new Error('Token missing sub');
    c.set('user', { id: sub, email: typeof payload.email === 'string' ? payload.email : undefined });
  } catch (err) {
    throw new HTTPException(401, { message: 'Invalid token', cause: err });
  }

  await next();
});

export type { Env as AuthEnv };
