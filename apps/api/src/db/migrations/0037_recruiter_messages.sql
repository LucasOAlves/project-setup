-- Milestone 5, ticket 3: replies about applications (spec section 7 RecruiterMessage). A Gmail
-- message is stored once (unique provider message id). One that matches no application keeps
-- only its id, so it is not read again. Bodies are cleared after 180 days.
CREATE TABLE IF NOT EXISTS recruiter_messages (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  provider_message_id text,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  sender_domain text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body text,
  received_at timestamptz,
  match_confidence text NOT NULL DEFAULT '',
  match_reason text NOT NULL DEFAULT '',
  classification text NOT NULL DEFAULT '',
  evidence text NOT NULL DEFAULT '',
  suggested_status text NOT NULL DEFAULT '',
  decision text NOT NULL DEFAULT '',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recruiter_messages_provider_message_id ON recruiter_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recruiter_messages_application ON recruiter_messages (application_id, received_at);
