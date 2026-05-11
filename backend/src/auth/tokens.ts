import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { email_verifications, password_resets } from '../db/schema.js';

// Tokens for verification + password reset are 32 bytes of randomness,
// encoded as hex (64 chars). They go in the URL the user clicks.

const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_HOURS = 1;

function genTokenHex(): string {
  return randomBytes(32).toString('hex');
}

function expiresAtIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ');
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 23).replace('T', ' ');
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// ── email verification ───────────────────────────────────────────────
// The token in the email IS the primary key (stored plaintext). This is
// safe because email-verification tokens are low-stakes — they confirm the
// user controls the email, nothing more.

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = genTokenHex();
  await db().insert(email_verifications).values({
    token,
    user_id: userId,
    expires_at: expiresAtIso(VERIFY_TOKEN_TTL_HOURS),
  });
  return token;
}

/**
 * Consume a verification token: if valid + not expired, return the user_id
 * and delete the token (single-use). Returns null otherwise.
 */
export async function consumeEmailVerificationToken(token: string): Promise<string | null> {
  if (!token || token.length !== 64) return null;
  const rows = await db()
    .select()
    .from(email_verifications)
    .where(eq(email_verifications.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db().delete(email_verifications).where(eq(email_verifications.token, token));
  const exp = new Date(row.expires_at + (row.expires_at.endsWith('Z') ? '' : 'Z')).getTime();
  if (exp <= Date.now()) return null;
  return row.user_id;
}

// ── password reset ───────────────────────────────────────────────────
// The token in the email is the secret; the DB stores SHA-256 of it. A DB
// dump alone can't be used to reset accounts.

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = genTokenHex();
  const tokenHash = sha256Hex(token);
  await db().insert(password_resets).values({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAtIso(RESET_TOKEN_TTL_HOURS),
  });
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  if (!token || token.length !== 64) return null;
  const tokenHash = sha256Hex(token);
  const rows = await db()
    .select()
    .from(password_resets)
    .where(eq(password_resets.token_hash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db().delete(password_resets).where(eq(password_resets.token_hash, tokenHash));
  const exp = new Date(row.expires_at + (row.expires_at.endsWith('Z') ? '' : 'Z')).getTime();
  if (exp <= Date.now()) return null;
  return row.user_id;
}

/** Best-effort sweep of expired verification + reset tokens. */
export async function purgeExpiredTokens(): Promise<void> {
  const cutoff = nowIso();
  await db().delete(email_verifications).where(lt(email_verifications.expires_at, cutoff));
  await db().delete(password_resets).where(lt(password_resets.expires_at, cutoff));
}
