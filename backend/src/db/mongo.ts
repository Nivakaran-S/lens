import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import { env } from '../env.js';
import { logger } from '../util/log.js';

const log = logger('mongo');

export type JobStatus =
  | 'queued'
  | 'uploaded'
  | 'extracting'
  | 'classifying'
  | 'analyzing'
  | 'synthesizing'
  | 'done'
  | 'failed';

// API shape — what callers see and what gets persisted to Inngest step
// outputs. Never includes _id.
export type JobDoc = {
  id: string;
  user_id: string;
  zip_storage_key: string;
  zip_filename: string;
  zip_size_bytes: number | null;
  property_label: string | null;
  status: JobStatus;
  status_detail: string | null;
  report: unknown | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentDoc = {
  id: string;
  job_id: string;
  filename: string;
  storage_key: string;
  size_bytes: number | null;
  gemini_file_uri: string | null;
  gemini_file_uploaded_at: string | null;
  doc_type: string | null;
  extraction: unknown | null;
  created_at: string;
};

export type UserRole = 'user' | 'admin';

export type UserDoc = {
  id: string; // Supabase auth user_id (uuid) — primary key
  email: string;
  role: UserRole;
  credits: number; // never negative; enforced via conditional update in deductCredits
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditPackageDoc = {
  id: string;
  name: string;
  credits: number;
  price_cents: number; // 999 = £9.99
  currency: string; // 'gbp' | 'usd' etc.
  active: boolean; // soft-delete via active=false
  created_at: string;
  updated_at: string;
};

export type PaymentSource =
  | 'stripe'           // user purchased credits via Stripe Checkout
  | 'admin_grant'      // admin manually allocated (signed delta)
  | 'signup_bonus'     // free credits awarded on first sign-in
  | 'refund'           // automatic refund after a failed analysis
  | 'analysis_charge'; // negative delta when starting an analysis

export type PaymentDoc = {
  id: string;
  user_id: string;
  package_id: string | null;
  source: PaymentSource;
  credits_delta: number; // signed: +N for grants/purchases, -N for deductions if you ever log them
  amount_cents: number | null; // null for non-cash sources
  currency: string | null;
  // Unique partial index — guarantees webhook idempotency. We embed payments
  // in our own page via Stripe Elements / PaymentIntent, so this is the
  // intent id (pi_…), not a Checkout Session id.
  stripe_payment_intent_id: string | null;
  admin_user_id: string | null; // when source='admin_grant'
  note: string | null;
  created_at: string;
};

// Storage shape — what MongoDB sees, with the auto-generated _id.
type WithMongoId<T> = T & { _id?: ObjectId };

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let connecting: Promise<{ client: MongoClient; db: Db }> | null = null;

const CONNECT_TIMEOUT_MS = 8_000;

async function connect(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
  if (connecting) {
    log.info('connect: awaiting in-flight connection');
    return connecting;
  }

  connecting = (async () => {
    const t0 = Date.now();
    const e = env();
    // Mask password segment of the URL for safe logging
    const safeUrl = e.MONGODB_URL.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
    log.info(`connect: opening`, { url: safeUrl, db: e.MONGODB_DB_NAME });
    const client = new MongoClient(e.MONGODB_URL, {
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: 20_000,
      maxPoolSize: 10,
    });
    try {
      await client.connect();
    } catch (err) {
      log.error(`connect: failed after ${Date.now() - t0}ms`, {
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      throw err;
    }
    const db = client.db(e.MONGODB_DB_NAME);
    cachedClient = client;
    cachedDb = db;
    log.info(`connect: ready in ${Date.now() - t0}ms`);
    return { client, db };
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function mongo(): Promise<Db> {
  return (await connect()).db;
}

export async function jobsCollection(): Promise<Collection<WithMongoId<JobDoc>>> {
  return (await mongo()).collection<WithMongoId<JobDoc>>('jobs');
}

export async function documentsCollection(): Promise<Collection<WithMongoId<DocumentDoc>>> {
  return (await mongo()).collection<WithMongoId<DocumentDoc>>('documents');
}

export async function usersCollection(): Promise<Collection<WithMongoId<UserDoc>>> {
  return (await mongo()).collection<WithMongoId<UserDoc>>('users');
}

export async function packagesCollection(): Promise<Collection<WithMongoId<CreditPackageDoc>>> {
  return (await mongo()).collection<WithMongoId<CreditPackageDoc>>('credit_packages');
}

export async function paymentsCollection(): Promise<Collection<WithMongoId<PaymentDoc>>> {
  return (await mongo()).collection<WithMongoId<PaymentDoc>>('payments');
}

// Webhook idempotency lives on stripe_payment_intent_id. The field is null
// on most rows (admin grants, signup bonuses, refunds, analysis charges) so
// we use a partial filter index that only enforces uniqueness when the
// field is actually a string. Sparse-unique would collide on the second
// null insert.
//
// Drops two flavours of legacy index from earlier iterations:
//  - `stripe_session_id_1` (Checkout-Session era, before embedded Elements)
//  - any `stripe_payment_intent_id_1` without a partialFilterExpression
async function ensurePaymentsIdempotencyIndex(
  payments: Collection<WithMongoId<PaymentDoc>>,
): Promise<void> {
  const existing = await payments.indexes();
  const legacyKeys = ['stripe_session_id', 'stripe_payment_intent_id'];
  for (const field of legacyKeys) {
    const broken = existing.find(
      (i) =>
        i.key &&
        Object.keys(i.key).length === 1 &&
        i.key[field] === 1 &&
        !i.partialFilterExpression,
    );
    if (broken && broken.name) {
      log.info(`ensurePaymentsIdempotencyIndex: dropping legacy index ${broken.name}`);
      await payments.dropIndex(broken.name);
    }
  }
  await payments.createIndex(
    { stripe_payment_intent_id: 1 },
    {
      unique: true,
      partialFilterExpression: { stripe_payment_intent_id: { $type: 'string' } },
    },
  );
}

let indexesEnsured = false;
export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const t0 = Date.now();
  log.info('ensureIndexes: starting');
  try {
    const jobs = await jobsCollection();
    const documents = await documentsCollection();
    const users = await usersCollection();
    const packages = await packagesCollection();
    const payments = await paymentsCollection();
    await Promise.all([
      jobs.createIndex({ id: 1 }, { unique: true }),
      jobs.createIndex({ user_id: 1, created_at: -1 }),
      documents.createIndex({ id: 1 }, { unique: true }),
      documents.createIndex({ job_id: 1, created_at: 1 }),
      users.createIndex({ id: 1 }, { unique: true }),
      users.createIndex({ email: 1 }, { unique: true }),
      packages.createIndex({ id: 1 }, { unique: true }),
      packages.createIndex({ active: 1, created_at: -1 }),
      payments.createIndex({ user_id: 1, created_at: -1 }),
      ensurePaymentsIdempotencyIndex(payments),
    ]);
    log.info(`ensureIndexes: done in ${Date.now() - t0}ms`);
  } catch (err) {
    indexesEnsured = false; // allow retry on next call
    log.error(`ensureIndexes: failed after ${Date.now() - t0}ms`, {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
}

export type {
  JobDoc as JobRow,
  DocumentDoc as DocumentRow,
  UserDoc as UserRow,
  CreditPackageDoc as CreditPackageRow,
  PaymentDoc as PaymentRow,
};
