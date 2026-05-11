import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { adminEmails, env } from '../env.js';
import { db, isUniqueViolation } from './client.js';
import { users, type UserDoc, type UserRole } from './schema.js';
import { insertPayment, type PaymentInsert } from './payments.js';

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
 * Look up the user by Supabase auth id; create with default credits + role
 * derived from ADMIN_EMAILS if missing. Idempotent across concurrent
 * first-touches: we attempt an INSERT and treat a duplicate-key error as
 * "another caller won the race" — then re-fetch.
 *
 * MariaDB has no ON CONFLICT … RETURNING, so this is the equivalent of
 * the Postgres version using try/catch instead.
 */
export async function getOrCreateUser(args: { id: string; email?: string }): Promise<UserDoc> {
  const email = (args.email ?? `${args.id}@unknown.local`).toLowerCase();
  const role: UserRole = adminEmails().has(email) ? 'admin' : 'user';
  const credits = env().INITIAL_FREE_CREDITS;

  let inserted = false;
  try {
    await db().insert(users).values({
      id: args.id,
      email,
      role,
      credits,
      stripe_customer_id: null,
    });
    inserted = true;
  } catch (err) {
    // Duplicate primary key — another concurrent caller won. Fall through
    // to the re-fetch below.
    if (!isUniqueViolation(err)) throw err;
  }

  if (inserted && credits > 0) {
    await insertPayment({
      user_id: args.id,
      source: 'signup_bonus',
      credits_delta: credits,
      note: `Welcome bonus (${credits} free credits)`,
    });
  }

  const existing = await getUser(args.id);
  if (!existing) {
    throw new Error(`getOrCreateUser: id=${args.id} not found after insert/race`);
  }
  return existing;
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
