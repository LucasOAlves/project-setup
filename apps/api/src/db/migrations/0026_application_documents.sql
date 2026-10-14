-- Application documents (Job Hunter, Milestone 2, spec section 7 Document): generated CVs,
-- cover letters and form answers for one job. Rows are never updated: a changed document is
-- a new version, recorded with the profile and application-details versions it was built from.
CREATE TABLE IF NOT EXISTS application_documents (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type text NOT NULL,
  version integer NOT NULL,
  origin text NOT NULL,
  profile_version integer NOT NULL,
  details_version integer,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  storage_key text,
  file_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, type, version)
)
