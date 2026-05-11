import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

// ── enum-like literal unions used in $type<…>() ──────────────────────
// Declared at the top so the table builders below can narrow text columns.
export type UserRole = 'user' | 'admin';
export type JobStatus =
  | 'queued'
  | 'uploaded'
  | 'extracting'
  | 'classifying'
  | 'analyzing'
  | 'synthesizing'
  | 'done'
  | 'failed';
export type PaymentSource =
  | 'stripe'
  | 'admin_grant'
  | 'signup_bonus'
  | 'refund'
  | 'analysis_charge';

// ── users ─────────────────────────────────────────────────────────────
// id is the Supabase auth user_id (UUID string from the JWT sub claim).
// MariaDB has no native UUID type — use char(36) holding the canonical
// 36-char string ("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx").
// Email is varchar with utf8mb4_general_ci collation for case-insensitive
// matching (replaces PG's CITEXT).
export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 320 }).notNull().unique(),
    role: varchar('role', { length: 16 }).$type<UserRole>().notNull().default('user'),
    credits: int('credits').notNull().default(0),
    stripe_customer_id: varchar('stripe_customer_id', { length: 64 }),
    created_at: timestamp('created_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    roleCheck: check('users_role_check', sql`${t.role} IN ('user','admin')`),
    creditsCheck: check('users_credits_check', sql`${t.credits} >= 0`),
  }),
);

// ── jobs ──────────────────────────────────────────────────────────────
export const jobs = mysqlTable(
  'jobs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    zip_storage_key: text('zip_storage_key').notNull(),
    zip_filename: varchar('zip_filename', { length: 512 }).notNull(),
    zip_size_bytes: bigint('zip_size_bytes', { mode: 'number' }),
    property_label: varchar('property_label', { length: 512 }),
    status: varchar('status', { length: 32 })
      .$type<JobStatus>()
      .notNull()
      .default('queued'),
    status_detail: text('status_detail'),
    report: json('report').$type<unknown>(),
    error: text('error'),
    created_at: timestamp('created_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      'jobs_status_check',
      sql`${t.status} IN ('queued','uploaded','extracting','classifying','analyzing','synthesizing','done','failed')`,
    ),
    userCreatedIdx: index('jobs_user_created_idx').on(t.user_id, t.created_at),
  }),
);

// ── documents ─────────────────────────────────────────────────────────
export const documents = mysqlTable(
  'documents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    job_id: varchar('job_id', { length: 36 }).notNull(),
    filename: varchar('filename', { length: 512 }).notNull(),
    storage_key: text('storage_key').notNull(),
    size_bytes: bigint('size_bytes', { mode: 'number' }),
    gemini_file_uri: text('gemini_file_uri'),
    gemini_file_uploaded_at: timestamp('gemini_file_uploaded_at', {
      mode: 'string',
      fsp: 3,
    }),
    doc_type: varchar('doc_type', { length: 64 }),
    extraction: json('extraction').$type<unknown>(),
    created_at: timestamp('created_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    jobCreatedIdx: index('documents_job_created_idx').on(t.job_id, t.created_at),
  }),
);

// ── credit_packages ───────────────────────────────────────────────────
export const credit_packages = mysqlTable(
  'credit_packages',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    credits: int('credits').notNull(),
    price_cents: int('price_cents').notNull(),
    currency: varchar('currency', { length: 8 }).notNull(),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    creditsCheck: check('credit_packages_credits_check', sql`${t.credits} > 0`),
    priceCheck: check('credit_packages_price_check', sql`${t.price_cents} >= 0`),
    activeCreatedIdx: index('credit_packages_active_idx').on(t.active, t.created_at),
  }),
);

// ── payments ──────────────────────────────────────────────────────────
// Append-only audit log. The unique index on stripe_payment_intent_id
// guarantees Stripe webhook idempotency. MariaDB's UNIQUE treats each NULL
// as distinct, so the many null rows from admin_grant / signup_bonus /
// refund / analysis_charge naturally don't collide — no partial-index
// trick needed (unlike Postgres).
export const payments = mysqlTable(
  'payments',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    user_id: varchar('user_id', { length: 36 }).notNull(),
    package_id: varchar('package_id', { length: 36 }),
    source: varchar('source', { length: 32 }).$type<PaymentSource>().notNull(),
    credits_delta: int('credits_delta').notNull(),
    amount_cents: int('amount_cents'),
    currency: varchar('currency', { length: 8 }),
    stripe_payment_intent_id: varchar('stripe_payment_intent_id', { length: 128 }),
    admin_user_id: varchar('admin_user_id', { length: 36 }),
    note: text('note'),
    created_at: timestamp('created_at', { mode: 'string', fsp: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sourceCheck: check(
      'payments_source_check',
      sql`${t.source} IN ('stripe','admin_grant','signup_bonus','refund','analysis_charge')`,
    ),
    userCreatedIdx: index('payments_user_created_idx').on(t.user_id, t.created_at),
    stripeIntentUnique: uniqueIndex('payments_stripe_intent_unique').on(
      t.stripe_payment_intent_id,
    ),
  }),
);

// ── exported types — same names callers used to import from mongo.ts
export type UserDoc = typeof users.$inferSelect;
export type JobDoc = typeof jobs.$inferSelect;
export type DocumentDoc = typeof documents.$inferSelect;
export type CreditPackageDoc = typeof credit_packages.$inferSelect;
export type PaymentDoc = typeof payments.$inferSelect;

// Aliases retained for callers that import the *Row names.
export type {
  JobDoc as JobRow,
  DocumentDoc as DocumentRow,
  UserDoc as UserRow,
  CreditPackageDoc as CreditPackageRow,
  PaymentDoc as PaymentRow,
};
