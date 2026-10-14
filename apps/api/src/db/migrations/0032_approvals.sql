-- Approvals (Job Hunter, Milestone 4, spec A08). One row per approval the user gives, bound to
-- the exact payload hash and destination they saw. Rows are never edited, except to record once
-- that the approval was invalidated by a later change.
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  payload_hash text NOT NULL,
  destination_url text NOT NULL,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_revision text NOT NULL DEFAULT '',
  decision text NOT NULL DEFAULT 'APPROVED',
  decided_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  invalidated_at timestamptz,
  invalidation_reason text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS approvals_application_idx ON approvals (application_id, decided_at);

-- At most one live approval per application.
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_live_idx ON approvals (application_id) WHERE invalidated_at IS NULL
