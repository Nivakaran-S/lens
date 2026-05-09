import { and, desc, eq, gte, ilike, lt, sql } from 'drizzle-orm';
import { adminEmails, env } from '../env.js';
import { db } from './client.js';
import { users, type UserDoc, type UserRole } from './schema.js';
import { insertPayment, type PaymentInsert } from './payments.js';

const now = () => new Date().toISOString();

export type { UserDoc, UserRole };

export async function getUser(id: string): Promise<UserDoc | null> {
  const rows = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<UserDoc | null> {
  // CITEXT makes the equality case-insensitive automatically.
  const rows = await db().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

/**
 * Look up the user by Supabase auth id; create with default credits + role
 * derived from ADMIN_EMAILS if missing. Idempotent across concurrent
 * first-touches via INSERT … ON CONFLICT (id) DO NOTHING — only the winning
 * insert returns a row, so the signup_bonus payment is only logged once.
 */
export async function getOrCreateUser(args: { id: string; email?: string }): Promise<UserDoc> {
  const email = (args.email ?? `${args.id}@unknown.local`).toLowerCase();
  const role: UserRole = adminEmails().has(email) ? 'admin' : 'user';
  const credits = env().INITIAL_FREE_CREDITS;

  // Race-safe insert: returns the row on insert, empty on conflict.
  const inserted = await db()
    .insert(users)
    .values({
      id: args.id,
      email,
      role,
      credits,
      stripe_customer_id: null,
    })
    .onConflictDoNothing({ target: users.id })
    .returning();

  if (inserted[0]) {
    // We won the race — log the signup bonus.
    if (credits > 0) {
      await insertPayment({
        user_id: args.id,
        source: 'signup_bonus',
        credits_delta: credits,
        note: `Welcome bonus (${credits} free credits)`,
      });
    }
    return inserted[0];
  }

  // Lost the race or already existed — re-fetch.
  const existing = await getUser(args.id);
  if (!existing) {
    throw new Error(`getOrCreateUser: id=${args.id} not found after ON CONFLICT`);
  }
  return existing;
}

/**
 * Atomically deduct credits ONLY if the user has enough. Wrapped in a
 * transaction so the audit-log payment row is tied to the balance change —
 * if the row insert fails, the deduction rolls back too.
 *
 * The atomicity guarantee: `UPDATE … WHERE credits >= $1 RETURNING credits`
 * either updates one row (acquiring its lock; concurrent updates serialise)
 * or zero rows. No transaction is needed for the underflow guard itself —
 * the transaction is purely for tying the payment row to the deduction.
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
    const updated = await tx
      .update(users)
      .set({ credits: sql`${users.credits} - ${amount}`, updated_at: now() })
      .where(and(eq(users.id, userId), gte(users.credits, amount)))
      .returning({ credits: users.credits });

    if (updated.length === 0) {
      // Either user missing or insufficient — re-fetch for accurate balance.
      const rows = await tx
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return { ok: false, balance: rows[0]?.credits ?? 0 };
    }

    // Insert audit row INSIDE the transaction. If this throws, the deduction
    // rolls back. Use the transaction's payments-collection helper.
    const { payments } = await import('./schema.js');
    await tx.insert(payments).values({
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

    return { ok: true, balance: updated[0]!.credits };
  });
}

/**
 * Atomically grant credits (positive delta only). Logs a payment row in the
 * same transaction. Used by Stripe webhook, signup bonus, admin grants, refunds.
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
    const updated = await tx
      .update(users)
      .set({ credits: sql`${users.credits} + ${amount}`, updated_at: now() })
      .where(eq(users.id, userId))
      .returning({ credits: users.credits });

    if (updated.length === 0) {
      throw new Error(`addCredits: user ${userId} not found`);
    }

    const { payments } = await import('./schema.js');
    await tx.insert(payments).values({
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

    return { balance: updated[0]!.credits };
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
 * is given (case-insensitive via CITEXT). Newest first.
 */
export async function listUsers(opts: ListUsersOptions = {}): Promise<UserDoc[]> {
  const conds = [];
  if (opts.search) {
    conds.push(ilike(users.email, `%${opts.search}%`));
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
