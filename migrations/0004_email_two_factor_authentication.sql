ALTER TABLE users ADD COLUMN email_2fa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_2fa_enabled IN (0, 1));

CREATE TABLE IF NOT EXISTS email_2fa_challenges (
  challenge_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_2fa_challenges_user_id
  ON email_2fa_challenges(user_id);
