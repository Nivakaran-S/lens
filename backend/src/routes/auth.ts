import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { sendPasswordResetEmail, sendVerificationEmail } from '../auth/email.js';
import { hashPassword, validatePassword, verifyPassword, WeakPasswordError } from '../auth/passwords.js';
import {
  createSession,
  deleteAllSessionsForUser,
  deleteSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth/sessions.js';
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createEmailVerificationToken,
  createPasswordResetToken,
} from '../auth/tokens.js';
import {
  createUser,
  EmailTakenError,
  getUserByEmail,
  markEmailVerified,
  updatePasswordHash,
} from '../db/users.js';
import { env } from '../env.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';

export const authRoute = new Hono();

const emailField = z.string().email().max(320);
const passwordField = z.string().min(8).max(256);

const signUpSchema = z.object({ email: emailField, password: passwordField });
const signInSchema = z.object({ email: emailField, password: passwordField });
const forgotPasswordSchema = z.object({ email: emailField });
const resetPasswordSchema = z.object({ token: z.string().length(64), password: passwordField });
const verifyEmailSchema = z.object({ token: z.string().length(64) });

function cookieOpts() {
  const e = env();
  return sessionCookieOptions({
    secure: e.COOKIE_SECURE,
    domain: e.COOKIE_DOMAIN || undefined,
  });
}

// ── POST /api/auth/sign-up ───────────────────────────────────────────
authRoute.post('/sign-up', async (c) => {
  const log = (c.get('log' as never) as Logger | undefined) ?? fallbackLogger('auth:sign-up');
  const body = await c.req.json().catch(() => null);
  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid email or password' });
  }

  let passwordHash: string;
  try {
    log.info('signUp: hashing password');
    passwordHash = await hashPassword(parsed.data.password);
    log.info('signUp: hash ok');
  } catch (err) {
    if (err instanceof WeakPasswordError) {
      throw new HTTPException(400, { message: err.message });
    }
    log.error('signUp: hashPassword threw', {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }

  try {
    log.info('signUp: creating user');
    const user = await createUser({
      email: parsed.data.email,
      passwordHash,
    });
    log.info('signUp: user created', { id: user.id.slice(0, 8) });

    log.info('signUp: creating verification token');
    const token = await createEmailVerificationToken(user.id);
    log.info('signUp: token created');

    sendVerificationEmail({ to: user.email, token }).catch((e) =>
      log.error('verification email send failed', {
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      }),
    );
    return c.json({ ok: true, email: user.email });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      // Don't leak that the email is taken — same response shape as success.
      // Frontend always tells the user "check your email". This avoids
      // email enumeration. If you'd prefer a clearer UX, return 409 here.
      return c.json({ ok: true, email: parsed.data.email });
    }
    log.error('signUp: user/token step threw', {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
});

// ── POST /api/auth/sign-in ───────────────────────────────────────────
authRoute.post('/sign-in', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid email or password' });
  }

  const user = await getUserByEmail(parsed.data.email);
  // Time-constant-ish: always run verifyPassword to mask "user not found"
  // vs "wrong password" from the response timing.
  const hashForVerify = user?.password_hash ?? '$argon2id$v=19$m=19456,t=2,p=1$dGVzdA$dGVzdA';
  const ok = await verifyPassword(hashForVerify, parsed.data.password);
  if (!user || !ok) {
    throw new HTTPException(401, { message: 'Invalid email or password' });
  }
  if (!user.email_verified) {
    throw new HTTPException(403, {
      message: 'Email not verified. Check your inbox for the verification link.',
    });
  }

  const session = await createSession(user.id);
  setCookie(c, SESSION_COOKIE_NAME, session.id, cookieOpts());

  return c.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, credits: user.credits },
  });
});

// ── POST /api/auth/sign-out ──────────────────────────────────────────
authRoute.post('/sign-out', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE_NAME);
  if (sid) {
    await deleteSession(sid).catch(() => {});
  }
  // Cookie domain must match the one used when setting, otherwise the
  // browser won't replace/clear it.
  const e = env();
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    domain: e.COOKIE_DOMAIN || undefined,
    secure: e.COOKIE_SECURE,
  });
  return c.json({ ok: true });
});

// ── POST /api/auth/verify-email ──────────────────────────────────────
authRoute.post('/verify-email', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid token' });
  }
  const userId = await consumeEmailVerificationToken(parsed.data.token);
  if (!userId) {
    throw new HTTPException(400, { message: 'Verification link is invalid or expired' });
  }
  await markEmailVerified(userId);
  return c.json({ ok: true });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────
authRoute.post('/forgot-password', async (c) => {
  const log = (c.get('log' as never) as Logger | undefined) ?? fallbackLogger('auth:forgot');
  const body = await c.req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    // Don't reveal whether the request shape was valid. Always 200.
    return c.json({ ok: true });
  }
  const user = await getUserByEmail(parsed.data.email);
  if (user) {
    const token = await createPasswordResetToken(user.id);
    sendPasswordResetEmail({ to: user.email, token }).catch((e) =>
      log.error('reset email send failed', { error: e instanceof Error ? e.message : String(e) }),
    );
  }
  // Always 200 to prevent email enumeration.
  return c.json({ ok: true });
});

// ── POST /api/auth/reset-password ────────────────────────────────────
authRoute.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid token or password' });
  }
  try {
    validatePassword(parsed.data.password);
  } catch (err) {
    if (err instanceof WeakPasswordError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }
  const userId = await consumePasswordResetToken(parsed.data.token);
  if (!userId) {
    throw new HTTPException(400, { message: 'Reset link is invalid or expired' });
  }
  const hash = await hashPassword(parsed.data.password);
  await updatePasswordHash(userId, hash);
  // Invalidate all sessions — the password is changing, so any active
  // session on another device should be killed.
  await deleteAllSessionsForUser(userId);
  return c.json({ ok: true });
});
