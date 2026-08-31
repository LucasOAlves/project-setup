CREATE TABLE IF NOT EXISTS content_plan_uploads (
  id uuid PRIMARY KEY,
  source_filename text NOT NULL,
  topics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
