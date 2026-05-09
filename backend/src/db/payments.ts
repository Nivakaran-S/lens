import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from './client.js';
import { payments, type PaymentDoc, type PaymentSource } from './schema.js';

export type { PaymentDoc, PaymentSource };

export type PaymentInsert = {
  user_id: string;
  package_id?: string | null;
  source: PaymentSource;
  credits_delta: number;
  amount_cents?: number | null;
  currency?: string | null;
  stripe_payment_intent_id?: string | null;
  admin_user_id?: string | null;
  note?: string | null;
};

/**
 * Append a payment row to the audit log. The unique partial index on
 * stripe_payment_intent_id makes this idempotent for Stripe webhooks: a
 * duplicate delivery attempts to insert with the same intent id and Postgres
 * throws 23505, which the caller catches via isUniqueViolation() in
 * routes/stripe.ts and treats as "already credited".
 */
export async function insertPayment(values: PaymentInsert): Promise<PaymentDoc> {
  const inserted = await db()
    .insert(payments)
    .values({
      id: randomUUID(),
      user_id: values.user_id,
      package_id: values.package_id ?? null,
      source: values.source,
      credits_delta: values.credits_delta,
      amount_cents: values.amount_cents ?? null,
      currency: values.currency ?? null,
      stripe_payment_intent_id: values.stripe_payment_intent_id ?? null,
      admin_user_id: values.admin_user_id ?? null,
      note: values.note ?? null,
    })
    .returning();
  return inserted[0]!;
}

export async function listPaymentsForUser(userId: string, limit = 50): Promise<PaymentDoc[]> {
  return db()
    .select()
    .from(payments)
    .where(eq(payments.user_id, userId))
    .orderBy(desc(payments.created_at))
    .limit(limit);
}

export async function paymentForIntent(stripePaymentIntentId: string): Promise<PaymentDoc | null> {
  const rows = await db()
    .select()
    .from(payments)
    .where(eq(payments.stripe_payment_intent_id, stripePaymentIntentId))
    .limit(1);
  return rows[0] ?? null;
}
