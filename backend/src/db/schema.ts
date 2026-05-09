import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// CITEXT (case-insensitive text). Drizzle has no first-class CITEXT type;
// declare it via customType. Behaves like text at the TypeScript level.
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

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
// id is the Supabase auth user_id (UUID). The backend never generates
// this — it comes from the JWT `sub` claim — so no DEFAULT.
// Timestamps use mode:'string' so callers see ISO strings as before.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: citext('email').notNull().unique(),
    role: text('role').$type<'user' | 'admin'>().notNull().default('user'),
    credits: integer('credits').notNull().default(0),
    stripe_customer_id: text('stripe_customer_id'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    roleCheck: check('users_role_check', sql`${t.role} IN ('user','admin')`),
    creditsCheck: check('users_credits_check', sql`${t.credits} >= 0`),
  }),
);

// ── jobs ──────────────────────────────────────────────────────────────
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    zip_storage_key: text('zip_storage_key').notNull(),
    zip_filename: text('zip_filename').notNull(),
    zip_size_bytes: bigint('zip_size_bytes', { mode: 'number' }),
    property_label: text('property_label'),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    status_detail: text('status_detail'),
    report: jsonb('report').$type<unknown>(),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusCheck: check(
      'jobs_status_check',
      sql`${t.status} IN ('queued','uploaded','extracting','classifying','analyzing','synthesizing','done','failed')`,
    ),
    userCreatedIdx: index('jobs_user_created_idx').on(t.user_id, t.created_at.desc()),
  }),
);

// ── documents ─────────────────────────────────────────────────────────
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job_id: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    storage_key: text('storage_key').notNull(),
    size_bytes: bigint('size_bytes', { mode: 'number' }),
    gemini_file_uri: text('gemini_file_uri'),
    gemini_file_uploaded_at: timestamp('gemini_file_uploaded_at', {
      withTimezone: true,
      mode: 'string',
    }),
    doc_type: text('doc_type'),
    extraction: jsonb('extraction').$type<unknown>(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    jobCreatedIdx: index('documents_job_created_idx').on(t.job_id, t.created_at),
  }),
);

// ── credit_packages ───────────────────────────────────────────────────
export const credit_packages = pgTable(
  'credit_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    credits: integer('credits').notNull(),
    price_cents: integer('price_cents').notNull(),
    currency: text('currency').notNull(),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    creditsCheck: check('credit_packages_credits_check', sql`${t.credits} > 0`),
    priceCheck: check('credit_packages_price_check', sql`${t.price_cents} >= 0`),
    activeCreatedIdx: index('credit_packages_active_idx').on(t.active, t.created_at.desc()),
  }),
);

// ── payments ──────────────────────────────────────────────────────────
// Append-only audit log. The partial unique index on stripe_payment_intent_id
// guarantees Stripe webhook idempotency without colliding on the many null
// rows from admin_grant / signup_bonus / refund / analysis_charge.
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    package_id: uuid('package_id').references(() => credit_packages.id, {
      onDelete: 'set null',
    }),
    source: text('source').$type<PaymentSource>().notNull(),
    credits_delta: integer('credits_delta').notNull(),
    amount_cents: integer('amount_cents'),
    currency: text('currency'),
    stripe_payment_intent_id: text('stripe_payment_intent_id'),
    admin_user_id: uuid('admin_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sourceCheck: check(
      'payments_source_check',
      sql`${t.source} IN ('stripe','admin_grant','signup_bonus','refund','analysis_charge')`,
    ),
    userCreatedIdx: index('payments_user_created_idx').on(t.user_id, t.created_at.desc()),
    stripeIntentUnique: uniqueIndex('payments_stripe_intent_unique')
      .on(t.stripe_payment_intent_id)
      .where(sql`${t.stripe_payment_intent_id} IS NOT NULL`),
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
