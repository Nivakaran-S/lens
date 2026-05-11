-- Lens — self-hosted auth schema.
-- Adds password_hash + email_verified to users, plus tables for sessions,
-- email verification tokens, and password reset tokens.
--
-- Apply with: npm run db:migrate

ALTER TABLE users
  ADD COLUMN password_hash  TEXT,
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE AFTER password_hash;

-- Sessions are opaque IDs (hex) issued by /api/auth/sign-in. Stored as a
-- cookie on the client; looked up here on every authenticated request.
CREATE TABLE sessions (
  id         VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX sessions_user_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- One-shot tokens emailed at sign-up. The token in the email matches the
-- primary key here; clicking the link consumes (deletes) the row.
CREATE TABLE email_verifications (
  token      VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT email_verifications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One-shot tokens emailed on /forgot-password. The TOKEN HASH is stored
-- here (sha256 of the secret in the URL), so a DB leak doesn't allow an
-- attacker to reset accounts. Plaintext token is only in the email.
CREATE TABLE password_resets (
  token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT password_resets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
