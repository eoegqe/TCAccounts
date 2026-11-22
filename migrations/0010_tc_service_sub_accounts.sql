PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tc_service_sub_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  main_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE,
  service TEXT NOT NULL COLLATE NOCASE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_service_sub_accounts_service_username
ON tc_service_sub_accounts(service COLLATE NOCASE, username COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_tc_service_sub_accounts_main_user
ON tc_service_sub_accounts(main_user_id, created_at);
