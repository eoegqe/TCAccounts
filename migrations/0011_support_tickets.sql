PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT UNIQUE,
  sender_email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_admin_username TEXT,
  acknowledgement_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_last_message
ON support_tickets(status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_admin
ON support_tickets(assigned_admin_id);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  email_message_id TEXT NOT NULL DEFAULT '',
  mailbox_uid INTEGER UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
ON support_ticket_messages(ticket_id, id);

CREATE TABLE IF NOT EXISTS support_ticket_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL
);
