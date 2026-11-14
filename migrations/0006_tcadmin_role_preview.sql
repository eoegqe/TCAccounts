CREATE TABLE IF NOT EXISTS tcadmin_role_preview (
  user_id INTEGER PRIMARY KEY,
  preview_role INTEGER CHECK (preview_role BETWEEN 0 AND 4),
  updated_at TEXT NOT NULL
);