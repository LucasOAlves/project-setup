-- Insert-only history of every status a job has passed through. Job.status alone can't
-- answer "did this job ever reach interview stage" once it moves to REJECTED/WITHDRAWN —
-- this table exists specifically so Career Analytics can compute real funnel/conversion
-- numbers instead of guessing from a single current-status snapshot.
CREATE TABLE IF NOT EXISTS job_status_events (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_status_events_job_id_idx ON job_status_events(job_id);
