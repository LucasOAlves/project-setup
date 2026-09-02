CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  website text NOT NULL DEFAULT '',
  linkedin_url text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  locations jsonb NOT NULL DEFAULT '[]',
  career_page_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  external_id text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  title text NOT NULL,
  location text NOT NULL DEFAULT '',
  workplace_type text,
  employment_type text,
  salary_min integer,
  salary_max integer,
  salary_currency text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  requirements jsonb NOT NULL DEFAULT '[]',
  preferred_qualifications jsonb NOT NULL DEFAULT '[]',
  technologies jsonb NOT NULL DEFAULT '[]',
  seniority text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'SAVED',
  fit_score integer,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  notes text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs(company_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
