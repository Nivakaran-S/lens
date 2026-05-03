import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { env } from './env.js';

export type AuthUser = { id: string; email?: string };

type Env = { Variables: { user: AuthUser } };

/**
 * Verify a Supabase access token locally — no network round-trip per request.
 *
 * Supabase signs user JWTs with one of:
 *   - HS256 (legacy): symmetric, uses the project's JWT Secret.
 *   - ES256 / RS256 / EdDSA: asymmetric, public keys exposed via the project's
 *     JWKS endpoint at /auth/v1/.well-known/jwks.json.
 *
 * We detect the algorithm from the token's header and pick the right path.
 * jose caches the JWKS internally after the first fetch, so steady-state
 * verification is ~1ms with no I/O.
 */

let cachedJwks: JWTVerifyGetKey | null = null;
function getJwks(): JWTVerifyGetKey {
  if (cachedJwks) return cachedJwks;
  const url = new URL('/auth/v1/.well-known/jwks.json', env().SUPABASE_URL);
  cachedJwks = createRemoteJWKSet(url);
  return cachedJwks;
}

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array | null {
  if (cachedSecret) return cachedSecret;
  const raw = env().SUPABASE_JWT_SECRET;
  if (!raw) return null;
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

const ASYMMETRIC_ALGS = ['ES256', 'RS256', 'EdDSA', 'ES384', 'RS384', 'ES512', 'RS512'] as const;

export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  let alg: string;
  try {
    alg = decodeProtectedHeader(token).alg ?? '';
  } catch {
    throw new HTTPException(401, { message: 'Malformed token header' });
  }

  try {
    const audience = env().SUPABASE_JWT_AUD;
    let payload;

    if (alg === 'HS256') {
      const secret = getSecret();
      if (!secret) {
        throw new HTTPException(500, {
          message: 'Token uses HS256 but SUPABASE_JWT_SECRET is not set',
        });
      }
      ({ payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], audience }));
    } else if ((ASYMMETRIC_ALGS as readonly string[]).includes(alg)) {
      ({ payload } = await jwtVerify(token, getJwks(), {
        algorithms: [...ASYMMETRIC_ALGS],
        audience,
      }));
    } else {
      throw new HTTPException(401, { message: `Unsupported JWT algorithm: ${alg}` });
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) throw new Error('JWT missing sub claim');
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    c.set('user', { id: sub, email });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('[auth] JWT verify failed', err);
    throw new HTTPException(401, { message: 'Invalid token', cause: err });
  }

  await next();
});

export type { Env as AuthEnv };
