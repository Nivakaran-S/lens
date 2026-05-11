import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { getSession, SESSION_COOKIE_NAME } from './auth/sessions.js';
import type { UserRole } from './db/schema.js';
import { logger as fallbackLogger, type Logger } from './util/log.js';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  credits: number;
};

type Env = { Variables: { user: AuthUser; log?: Logger } };

/**
 * Read the session cookie and resolve the corresponding user row. Sets
 * c.var.user with the user's profile (id, email, role, credits).
 * Throws 401 on missing/invalid/expired session.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('auth');
  const t0 = Date.now();

  const sid = getCookie(c, SESSION_COOKIE_NAME);
  if (!sid) {
    throw new HTTPException(401, { message: 'Not signed in' });
  }

  const result = await getSession(sid);
  if (!result) {
    throw new HTTPException(401, { message: 'Session expired' });
  }

  c.set('user', {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    credits: result.user.credits,
  });

  log.info(`auth: ok in ${Date.now() - t0}ms`, {
    sub: result.user.id.slice(0, 8),
    role: result.user.role,
    credits: result.user.credits,
  });

  await next();
});

/**
 * Same as requireAuth, plus a 403 if the user isn't an admin. Must be
 * mounted AFTER requireAuth so c.var.user is populated.
 */
export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('auth');
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  if (user.role !== 'admin') {
    log.warn('auth: admin check failed', { sub: user.id.slice(0, 8), role: user.role });
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  await next();
});

export type { Env as AuthEnv };
