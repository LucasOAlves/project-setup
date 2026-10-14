-- Applications (Job Hunter, Milestone 3, spec sections 4 and 7). One application per job,
-- since a job comes from a single source. Every status change is kept in application_events.
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL,
  mode text NOT NULL,
  portal text,
  destination_url text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_events (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_events_application_idx ON application_events (application_id, created_at)
