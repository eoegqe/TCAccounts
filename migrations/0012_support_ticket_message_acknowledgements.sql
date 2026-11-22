ALTER TABLE support_ticket_messages
ADD COLUMN acknowledgement_sent INTEGER NOT NULL DEFAULT 0;
