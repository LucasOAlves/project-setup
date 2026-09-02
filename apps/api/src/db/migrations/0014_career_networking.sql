CREATE TABLE IF NOT EXISTS recruiters (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  linkedin_url text NOT NULL DEFAULT '',
  connection_status text NOT NULL DEFAULT 'NOT_CONNECTED',
  relevance_score integer,
  notes text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiters_company_id_idx ON recruiters(company_id);
CREATE INDEX IF NOT EXISTS recruiters_related_job_id_idx ON recruiters(related_job_id);
