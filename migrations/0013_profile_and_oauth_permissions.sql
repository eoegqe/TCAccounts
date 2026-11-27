PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN preferences_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS oauth_user_consents (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_consents_user ON oauth_user_consents(user_id);
