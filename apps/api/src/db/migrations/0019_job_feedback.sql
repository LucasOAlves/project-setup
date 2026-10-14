-- Relevance feedback on a job evaluation (JOB-014). Insert-only: the newest row for a job is
-- the current verdict, earlier rows stay as history for calibrating the match weights.
CREATE TABLE IF NOT EXISTS job_feedback (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  evaluation_id uuid NOT NULL REFERENCES job_evaluations(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_feedback_job_created_idx ON job_feedback (job_id, created_at DESC)
