import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { env } from './env.js';
import { logger as fallbackLogger, type Logger } from './util/log.js';

export type AuthUser = { id: string; email?: string };

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
  log.info(`auth: token alg=${alg}`);

  try {
    const audience = env().SUPABASE_JWT_AUD;
    let payload;

    if (alg === 'HS256') {
      const secret = getSecret();
      if (!secret) {
        log.error('auth: token uses HS256 but SUPABASE_JWT_SECRET is not set');
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
        log.info(`auth: jwks first verify in ${Date.now() - t0}ms (includes JWKS fetch)`);
      }
    } else {
      log.warn(`auth: unsupported alg ${alg}`);
      throw new HTTPException(401, { message: `Unsupported JWT algorithm: ${alg}` });
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) throw new Error('JWT missing sub claim');
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    c.set('user', { id: sub, email });
    log.info(`auth: ok in ${Date.now() - t0}ms`, { sub: sub.slice(0, 8) });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    log.error(`auth: verify failed after ${Date.now() - t0}ms`, {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw new HTTPException(401, { message: 'Invalid token', cause: err });
  }

  await next();
});

export type { Env as AuthEnv };
