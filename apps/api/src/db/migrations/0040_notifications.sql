-- Milestone 5, ticket 6: notifications sent through Telegram. The key is claimed before sending,
-- so each event (an application change, a message, a day's digest) is sent at most once. Only
-- what was sent and when is kept here, never the message text.
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  kind text NOT NULL,
  status text NOT NULL,
  error text NOT NULL DEFAULT '',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
