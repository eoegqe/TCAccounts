PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT UNIQUE,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Waiting for User', 'Resolved', 'Closed')),
  assigned_admin_id TEXT,
  assigned_admin_username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  FOREIGN KEY (assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_admin_id, status);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  sender_email TEXT,
  sender_name TEXT,
  body TEXT NOT NULL,
  email_message_id TEXT,
  mailbox_uid INTEGER UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_ticket_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
