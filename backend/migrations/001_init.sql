-- Lens — initial schema (MariaDB / MySQL).
--
-- Run via: npm run db:migrate
-- The migrate script wraps each SQL file in a transaction and tracks
-- applied migrations in __migrations.
--
-- Differences from the Postgres version that was originally written:
--  - UUIDs are CHAR(36) strings (no native UUID type)
--  - JSONB → JSON (MariaDB stores JSON as text but with json_* functions)
--  - CITEXT → varchar with utf8mb4_general_ci collation (case-insensitive)
--  - Partial unique index on stripe_payment_intent_id is unnecessary because
--    MariaDB's UNIQUE treats each NULL as distinct (unlike Postgres)
--  - TIMESTAMPTZ → DATETIME(3) (timestamp limited to 2038; DATETIME is unbounded)

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ── users ────────────────────────────────────────────────────────────
-- id == Supabase auth.users.id (UUID string from JWT sub claim). Backend
-- never generates this, hence no DEFAULT.
-- email uses ci collation for case-insensitive comparisons (replaces
-- Postgres CITEXT).
CREATE TABLE users (
  id                  CHAR(36)      NOT NULL PRIMARY KEY,
  email               VARCHAR(320)  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL UNIQUE,
  role                VARCHAR(16)   NOT NULL DEFAULT 'user',
  credits             INT           NOT NULL DEFAULT 0,
  stripe_customer_id  VARCHAR(64),
  created_at          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT users_role_check    CHECK (role IN ('user','admin')),
  CONSTRAINT users_credits_check CHECK (credits >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── jobs ─────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  user_id         CHAR(36)     NOT NULL,
  zip_storage_key TEXT         NOT NULL,
  zip_filename    VARCHAR(512) NOT NULL,
  zip_size_bytes  BIGINT,
  property_label  VARCHAR(512),
  status          VARCHAR(32)  NOT NULL DEFAULT 'queued',
  status_detail   TEXT,
  report          JSON,
  error           TEXT,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT jobs_status_check CHECK (status IN (
    'queued','uploaded','extracting','classifying',
    'analyzing','synthesizing','done','failed'
  )),
  CONSTRAINT jobs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX jobs_user_created_idx ON jobs (user_id, created_at);

-- ── documents ────────────────────────────────────────────────────────
CREATE TABLE documents (
  id                       CHAR(36)     NOT NULL PRIMARY KEY,
  job_id                   CHAR(36)     NOT NULL,
  filename                 VARCHAR(512) NOT NULL,
  storage_key              TEXT         NOT NULL,
  size_bytes               BIGINT,
  gemini_file_uri          TEXT,
  gemini_file_uploaded_at  DATETIME(3),
  doc_type                 VARCHAR(64),
  extraction               JSON,
  created_at               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT documents_job_fk FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX documents_job_created_idx ON documents (job_id, created_at);

-- ── credit_packages ──────────────────────────────────────────────────
CREATE TABLE credit_packages (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  name         VARCHAR(256) NOT NULL,
  credits      INT          NOT NULL,
  price_cents  INT          NOT NULL,
  currency     VARCHAR(8)   NOT NULL,
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT credit_packages_credits_check CHECK (credits > 0),
  CONSTRAINT credit_packages_price_check   CHECK (price_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX credit_packages_active_idx ON credit_packages (active, created_at);

-- ── payments (append-only audit log) ─────────────────────────────────
CREATE TABLE payments (
  id                        CHAR(36)     NOT NULL PRIMARY KEY,
  user_id                   CHAR(36)     NOT NULL,
  package_id                CHAR(36),
  source                    VARCHAR(32)  NOT NULL,
  credits_delta             INT          NOT NULL,
  amount_cents              INT,
  currency                  VARCHAR(8),
  stripe_payment_intent_id  VARCHAR(128),
  admin_user_id             CHAR(36),
  note                      TEXT,
  created_at                DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT payments_source_check CHECK (source IN (
    'stripe','admin_grant','signup_bonus','refund','analysis_charge'
  )),
  CONSTRAINT payments_user_fk    FOREIGN KEY (user_id)       REFERENCES users(id)            ON DELETE CASCADE,
  CONSTRAINT payments_package_fk FOREIGN KEY (package_id)    REFERENCES credit_packages(id)  ON DELETE SET NULL,
  CONSTRAINT payments_admin_fk   FOREIGN KEY (admin_user_id) REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX payments_user_created_idx ON payments (user_id, created_at);

-- Idempotency index for Stripe webhook. MariaDB's UNIQUE treats each NULL
-- as distinct, so the many null rows from admin_grant / signup_bonus /
-- refund / analysis_charge don't collide.
CREATE UNIQUE INDEX payments_stripe_intent_unique
  ON payments (stripe_payment_intent_id);
