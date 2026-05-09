import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { env } from './env.js';
import { getOrCreateUser } from './db/users.js';
import type { UserRole } from './db/schema.js';
import { logger as fallbackLogger, type Logger } from './util/log.js';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  credits: number;
};

type Env = { Variables: { user: AuthUser; log?: Logger } };

let cachedJwks: JWTVerifyGetKey | null = null;
let jwksWarmed = false;

function getJwks(log: Logger): JWTVerifyGetKey {
  if (cachedJwks) return cachedJwks;
  const url = new URL('/auth/v1/.well-known/jwks.json', env().SUPABASE_URL);
  log.info(`jwks: creating remote set`, { url: url.toString() });
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

/**
 * Verify a Supabase JWT and resolve the corresponding MongoDB user (creating
 * it on first sign-in via getOrCreateUser). Sets c.var.user with the full
 * profile including role and credits.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('auth');
  const t0 = Date.now();

  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    log.warn('auth: missing bearer token');
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  let alg: string;
  try {
    alg = decodeProtectedHeader(token).alg ?? '';
  } catch {
    log.warn('auth: malformed token header');
    throw new HTTPException(401, { message: 'Malformed token header' });
  }

  let sub: string;
  let emailFromJwt: string | undefined;

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
      const jwks = getJwks(log);
      const wasWarm = jwksWarmed;
      ({ payload } = await jwtVerify(token, jwks, {
        algorithms: [...ASYMMETRIC_ALGS],
        audience,
      }));
      if (!wasWarm) {
        jwksWarmed = true;
        log.info(`auth: jwks first verify in ${Date.now() - t0}ms`);
      }
    } else {
      throw new HTTPException(401, { message: `Unsupported JWT algorithm: ${alg}` });
    }

    const subClaim = typeof payload.sub === 'string' ? payload.sub : null;
    if (!subClaim) throw new Error('JWT missing sub claim');
    sub = subClaim;
    emailFromJwt = typeof payload.email === 'string' ? payload.email : undefined;
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    log.error(`auth: verify failed after ${Date.now() - t0}ms`, {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw new HTTPException(401, { message: 'Invalid token', cause: err });
  }

  // Resolve / lazy-create the MongoDB user row. This is what makes
  // role + credits available to downstream handlers.
  const user = await getOrCreateUser({ id: sub, email: emailFromJwt });
  c.set('user', {
    id: user.id,
    email: user.email,
    role: user.role,
    credits: user.credits,
  });

  log.info(`auth: ok in ${Date.now() - t0}ms`, {
    sub: sub.slice(0, 8),
    role: user.role,
    credits: user.credits,
  });

  await next();
});

/**
 * Same as requireAuth, plus a 403 if the user isn't an admin. Use on every
 * /api/admin/* route. Does not require a separate JWT verify — callers
 * should mount requireAuth first via app.use, OR call this in isolation
 * (it includes the auth check).
 */
export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('auth');
  const user = c.get('user');
  if (!user) {
    // requireAuth wasn't run before us — defensive 401.
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  if (user.role !== 'admin') {
    log.warn('auth: admin check failed', { sub: user.id.slice(0, 8), role: user.role });
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  await next();
});

export type { Env as AuthEnv };
