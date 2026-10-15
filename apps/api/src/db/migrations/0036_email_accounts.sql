-- Milestone 5, ticket 2: the connected recruiter mailbox (Gmail, read-only scope). The refresh
-- token is stored sealed with APP_ENCRYPTION_KEY (secret-box.ts), never in plain text. One
-- account per provider, since the app has a single user.
CREATE TABLE IF NOT EXISTS email_accounts (
  id uuid PRIMARY KEY,
  provider text NOT NULL UNIQUE,
  email_address text NOT NULL,
  sealed_refresh_token text NOT NULL,
  scope text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  last_error text NOT NULL DEFAULT ''
);
