-- Submission runs (Job Hunter, Milestone 4, spec section 7 Execution). One row per run. The
-- unique approval_id is the at-most-once guarantee: an approval can start one run, ever.
CREATE TABLE IF NOT EXISTS executions (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL UNIQUE REFERENCES approvals(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  finished_at timestamptz,
  result text NOT NULL DEFAULT '',
  error_type text NOT NULL DEFAULT '',
  submit_status integer,
  confirmation_reference text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS executions_application_idx ON executions (application_id, started_at);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS confirmation_reference text NOT NULL DEFAULT ''
