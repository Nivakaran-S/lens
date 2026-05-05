import { randomUUID } from 'node:crypto';
import { paymentsCollection, type PaymentDoc, type PaymentSource } from './mongo.js';

const now = () => new Date().toISOString();

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
 * duplicate delivery attempts to insert with the same intent id and Mongo
 * throws E11000, which the caller can catch and treat as "already credited".
 */
export async function insertPayment(values: PaymentInsert): Promise<PaymentDoc> {
  const payments = await paymentsCollection();
  const doc: PaymentDoc = {
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
    created_at: now(),
  };
  await payments.insertOne(doc);
  return doc;
}

export async function listPaymentsForUser(userId: string, limit = 50): Promise<PaymentDoc[]> {
  const payments = await paymentsCollection();
  const cursor = payments
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit);
  const out: PaymentDoc[] = [];
  for await (const p of cursor) {
    const { _id: _omit, ...rest } = p;
    out.push(rest as PaymentDoc);
  }
  return out;
}

export async function paymentForIntent(stripePaymentIntentId: string): Promise<PaymentDoc | null> {
  const payments = await paymentsCollection();
  const doc = await payments.findOne({ stripe_payment_intent_id: stripePaymentIntentId });
  if (!doc) return null;
  const { _id: _omit, ...rest } = doc;
  return rest as PaymentDoc;
}
