import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { adminEmails, env } from '../env.js';
import { db, isUniqueViolation } from './client.js';
import { users, type UserDoc, type UserRole } from './schema.js';
import { insertPayment, type PaymentInsert } from './payments.js';

export class EmailTakenError extends Error {
  constructor() {
    super('A user with this email already exists');
    this.name = 'EmailTakenError';
  }
}

const now = () => new Date().toISOString().slice(0, 23).replace('T', ' ');

export type { UserDoc, UserRole };

export async function getUser(id: string): Promise<UserDoc | null> {
  const rows = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<UserDoc | null> {
  // The email column uses utf8mb4_general_ci collation so eq() is
  // case-insensitive (replaces PG's CITEXT).
  const rows = await db()
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create a brand-new user with email + password hash. Throws EmailTakenError
 * if the email is already registered. Role is derived from ADMIN_EMAILS;
 * initial credit grant is logged as a signup_bonus payment.
 *
 * The caller (sign-up route) hashes the password and provides the hash.
 */
export async function createUser(args: {
  email: string;
  passwordHash: string;
}): Promise<UserDoc> {
  const email = args.email.toLowerCase();
  const role: UserRole = adminEmails().has(email) ? 'admin' : 'user';
  const credits = env().INITIAL_FREE_CREDITS;
  const id = randomUUID();

  try {
    await db().insert(users).values({
      id,
      email,
      password_hash: args.passwordHash,
      email_verified: false,
      role,
      credits,
      stripe_customer_id: null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailTakenError();
    throw err;
  }

  if (credits > 0) {
    await insertPayment({
      user_id: id,
      source: 'signup_bonus',
      credits_delta: credits,
      note: `Welcome bonus (${credits} free credits)`,
    });
  }

  const created = await getUser(id);
  if (!created) throw new Error(`createUser: id=${id} not found after insert`);
  return created;
}

/** Mark email_verified=true. Used by the verify-email endpoint. */
export async function markEmailVerified(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({ email_verified: true, updated_at: now() })
    .where(eq(users.id, userId));
}

/** Replace the password_hash on a user. Used by password-reset endpoint. */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db()
    .update(users)
    .set({ password_hash: passwordHash, updated_at: now() })
    .where(eq(users.id, userId));
}

/**
 * Atomically deduct credits ONLY if the user has enough. Wrapped in a
 * transaction so the audit-log payment row is tied to the balance change.
 *
 * MariaDB lacks RETURNING, so we read affectedRows from the UPDATE result
 * to decide success, then SELECT the new balance. The row-level lock on
 * the UPDATE serialises concurrent deductions correctly.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  payment: Omit<PaymentInsert, 'user_id' | 'credits_delta'>,
): Promise<{ ok: boolean; balance: number }> {
  if (amount <= 0) {
    const u = await getUser(userId);
    return { ok: true, balance: u?.credits ?? 0 };
  }

  return db().transaction(async (tx) => {
    const result = await tx
      .update(users)
      .set({ credits: sql`${users.credits} - ${amount}`, updated_at: now() })
      .where(and(eq(users.id, userId), gte(users.credits, amount)));

    // Drizzle's mysql2 update returns a tuple [ResultSetHeader, FieldPacket[]].
    // affectedRows tells us whether the conditional UPDATE matched a row.
    const header = (result as unknown as { affectedRows?: number }[])[0];
    const affected = header?.affectedRows ?? 0;

    if (affected === 0) {
      // Either user missing or insufficient — re-fetch for accurate balance.
      const rows = await tx
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return { ok: false, balance: rows[0]?.credits ?? 0 };
    }

    // Insert audit row INSIDE the transaction. If this throws, the deduction
    // rolls back.
    const { payments } = await import('./schema.js');
    await tx.insert(payments).values({
      id: randomId(),
      user_id: userId,
      package_id: payment.package_id ?? null,
      source: payment.source,
      credits_delta: -amount,
      amount_cents: payment.amount_cents ?? null,
      currency: payment.currency ?? null,
      stripe_payment_intent_id: payment.stripe_payment_intent_id ?? null,
      admin_user_id: payment.admin_user_id ?? null,
      note: payment.note ?? null,
    });

    const rows = await tx
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return { ok: true, balance: rows[0]?.credits ?? 0 };
  });
}

/**
 * Atomically grant credits (positive delta only). Logs a payment row in
 * the same transaction.
 */
export async function addCredits(
  userId: string,
  amount: number,
  payment: Omit<PaymentInsert, 'user_id' | 'credits_delta'>,
): Promise<{ balance: number }> {
  if (amount <= 0) {
    const u = await getUser(userId);
    return { balance: u?.credits ?? 0 };
  }

  return db().transaction(async (tx) => {
    const result = await tx
      .update(users)
      .set({ credits: sql`${users.credits} + ${amount}`, updated_at: now() })
      .where(eq(users.id, userId));

    const header = (result as unknown as { affectedRows?: number }[])[0];
    if ((header?.affectedRows ?? 0) === 0) {
      throw new Error(`addCredits: user ${userId} not found`);
    }

    const { payments } = await import('./schema.js');
    await tx.insert(payments).values({
      id: randomId(),
      user_id: userId,
      package_id: payment.package_id ?? null,
      source: payment.source,
      credits_delta: amount,
      amount_cents: payment.amount_cents ?? null,
      currency: payment.currency ?? null,
      stripe_payment_intent_id: payment.stripe_payment_intent_id ?? null,
      admin_user_id: payment.admin_user_id ?? null,
      note: payment.note ?? null,
    });

    const rows = await tx
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return { balance: rows[0]?.credits ?? 0 };
  });
}

export async function setRole(userId: string, role: UserRole): Promise<void> {
  await db()
    .update(users)
    .set({ role, updated_at: now() })
    .where(eq(users.id, userId));
}

/**
 * GDPR right-of-erasure helper. Doesn't hard-delete the user row because
 * payments.user_id is FK-CASCADE'd and we need to preserve the audit log
 * for accounting / anti-fraud / Stripe reconciliation.
 *
 * Instead: zero the personal data, blow away the password hash so the row
 * can never be signed into, and recycle the email to a tombstone so the
 * original address is free to re-register.
 */
export async function anonymiseUser(userId: string): Promise<void> {
  const tombstone = `deleted-${userId}@removed.local`;
  await db()
    .update(users)
    .set({
      email: tombstone,
      password_hash: null,
      email_verified: false,
      stripe_customer_id: null,
      credits: 0,
      updated_at: now(),
    })
    .where(eq(users.id, userId));
}

export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await db()
    .update(users)
    .set({ stripe_customer_id: customerId, updated_at: now() })
    .where(eq(users.id, userId));
}

export type ListUsersOptions = {
  search?: string;
  limit?: number;
  cursor?: string; // created_at ISO string for keyset pagination
};

/**
 * List users for the admin panel. Filter on email substring if `search`
 * is given (case-insensitive via the column's ci collation). Newest first.
 */
export async function listUsers(opts: ListUsersOptions = {}): Promise<UserDoc[]> {
  const conds = [];
  if (opts.search) {
    // utf8mb4_general_ci on the column makes LIKE case-insensitive.
    conds.push(like(users.email, `%${opts.search}%`));
  }
  if (opts.cursor) {
    conds.push(lt(users.created_at, opts.cursor));
  }
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
  const limit = Math.min(opts.limit ?? 50, 500);

  const query = db().select().from(users).orderBy(desc(users.created_at)).limit(limit);
  if (where) {
    return query.where(where);
  }
  return query;
}

const randomId = (): string => randomUUID();
