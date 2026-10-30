CREATE TABLE IF NOT EXISTS tc_sub_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  main_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK (main_user_id <> sub_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tc_sub_accounts_main_user_id ON tc_sub_accounts(main_user_id);
