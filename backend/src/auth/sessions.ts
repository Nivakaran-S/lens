import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users, type UserDoc, type SessionDoc } from '../db/schema.js';

const SESSION_DURATION_DAYS = 30;

function newSessionId(): string {
  // 32 bytes = 64 hex chars. Cryptographically random, fits in our PK length.
  return randomBytes(32).toString('hex');
}

function expiresAt(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 23).replace('T', ' ');
}

export type SessionWithUser = { session: SessionDoc; user: UserDoc };

/** Create a fresh session and return its ID. Caller sets the cookie. */
export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = newSessionId();
  const expires = expiresAt(SESSION_DURATION_DAYS);
  await db().insert(sessions).values({
    id,
    user_id: userId,
    expires_at: expires,
  });
  return { id, expiresAt: new Date(expires + 'Z') };
}

/**
 * Look up a session by id and return both the session row AND the user.
 * Returns null if the session is missing or expired.
 */
export async function getSession(id: string): Promise<SessionWithUser | null> {
  if (!id) return null;
  const rows = await db()
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Compare as ISO strings — fast path, server-side enforcement.
  const expIso = row.session.expires_at;
  if (new Date(expIso + (expIso.endsWith('Z') ? '' : 'Z')).getTime() <= Date.now()) {
    // Expired — delete and return null. Best-effort cleanup.
    await deleteSession(id).catch(() => {});
    return null;
  }

  return row;
}

export async function deleteSession(id: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.id, id));
}

/** Delete all sessions for a user. Used on password reset / explicit "sign out everywhere". */
export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.user_id, userId));
}

/** Best-effort sweep of expired sessions. Call from a periodic job if desired. */
export async function purgeExpiredSessions(): Promise<void> {
  const cutoff = new Date().toISOString().slice(0, 23).replace('T', ' ');
  await db().delete(sessions).where(lt(sessions.expires_at, cutoff));
}

// ── Cookie config ────────────────────────────────────────────────────
// HttpOnly so JS can't read the session id. SameSite=Lax so cross-site
// POSTs don't carry it but normal top-level navigation does. Secure in
// production. Path=/ so every backend endpoint sees it.
export const SESSION_COOKIE_NAME = 'lens_sid';

export function sessionCookieOptions(opts: { secure: boolean; domain?: string }) {
  const o: {
    httpOnly: true;
    sameSite: 'Lax';
    secure: boolean;
    path: string;
    maxAge: number;
    domain?: string;
  } = {
    httpOnly: true,
    sameSite: 'Lax',
    secure: opts.secure,
    path: '/',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  };
  // Setting Domain makes the cookie available to all subdomains. For our
  // split-domain setup (frontend on apex, backend on api subdomain), the
  // cookie needs to be readable by both — set to '.checkmylegals.co.uk'.
  // For localhost dev, leave undefined.
  if (opts.domain) o.domain = opts.domain;
  return o;
}
