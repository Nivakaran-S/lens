-- Lens — initial schema (PostgreSQL).
--
-- Run via: npm run db:migrate
-- The migrate script wraps each SQL file in a transaction and tracks applied
-- migrations in __migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── users ────────────────────────────────────────────────────────────
-- id == Supabase auth.users.id (UUID). Backend never generates this; it
-- comes from the JWT sub claim. Hence no DEFAULT.
CREATE TABLE users (
  id                 UUID PRIMARY KEY,
  email              CITEXT NOT NULL UNIQUE,
  role               TEXT NOT NULL DEFAULT 'user'
                       CHECK (role IN ('user','admin')),
  credits            INTEGER NOT NULL DEFAULT 0
                       CHECK (credits >= 0),
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── jobs ─────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zip_storage_key TEXT NOT NULL,
  zip_filename    TEXT NOT NULL,
  zip_size_bytes  BIGINT,
  property_label  TEXT,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN (
                      'queued','uploaded','extracting','classifying',
                      'analyzing','synthesizing','done','failed'
                    )),
  status_detail   TEXT,
  report          JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_user_created_idx ON jobs (user_id, created_at DESC);

-- ── documents ────────────────────────────────────────────────────────
CREATE TABLE documents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  filename                 TEXT NOT NULL,
  storage_key              TEXT NOT NULL,
  size_bytes               BIGINT,
  gemini_file_uri          TEXT,
  gemini_file_uploaded_at  TIMESTAMPTZ,
  doc_type                 TEXT,
  extraction               JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_job_created_idx ON documents (job_id, created_at);

-- ── credit_packages ──────────────────────────────────────────────────
CREATE TABLE credit_packages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  credits      INTEGER NOT NULL CHECK (credits > 0),
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  currency     TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_packages_active_idx ON credit_packages (active, created_at DESC);

-- ── payments (append-only audit log) ─────────────────────────────────
CREATE TABLE payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id                UUID REFERENCES credit_packages(id) ON DELETE SET NULL,
  source                    TEXT NOT NULL CHECK (source IN (
                              'stripe','admin_grant','signup_bonus',
                              'refund','analysis_charge'
                            )),
  credits_delta             INTEGER NOT NULL,
  amount_cents              INTEGER,
  currency                  TEXT,
  stripe_payment_intent_id  TEXT,
  admin_user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  note                      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_user_created_idx ON payments (user_id, created_at DESC);

-- THE idempotency index. Partial — only enforced when the column is non-NULL,
-- so the many `null` values from admin_grant / signup_bonus / refund /
-- analysis_charge rows don't collide.
CREATE UNIQUE INDEX payments_stripe_intent_unique
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
