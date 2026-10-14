-- Job Hunter foundation (JOB-002, JOB-010, ADR-015). Additive only: existing Career rows keep
-- working, new columns default to empty, and nothing here deletes or rewrites data.

-- Per-source permission registry (spec §6 "Application policies"). One row per adapter.
-- discovery_allowed gates whether scheduled discovery may call the source at all,
-- application_mode is how far automation may go when applying through it (Milestone 3+):
-- MANUAL (user applies themselves), ASSISTED (we prepare, user submits), AUTOMATED
-- (approved submission permitted). Everything starts MANUAL until its terms are reviewed.
CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  domain text NOT NULL,
  adapter_type text NOT NULL,
  discovery_allowed boolean NOT NULL DEFAULT true,
  application_mode text NOT NULL DEFAULT 'MANUAL',
  terms_url text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sources (id, domain, adapter_type) VALUES
  ('greenhouse', 'boards.greenhouse.io', 'BOARD'),
  ('lever', 'jobs.lever.co', 'BOARD'),
  ('ashby', 'jobs.ashbyhq.com', 'BOARD'),
  ('remoteok', 'remoteok.com', 'SEARCH'),
  ('arbeitnow', 'www.arbeitnow.com', 'SEARCH'),
  ('adzuna', 'www.adzuna.com', 'SEARCH')
ON CONFLICT (id) DO NOTHING;

-- Provenance on each job (spec §7 Job). raw_description is the text exactly as the source
-- returned it, kept apart from description (which the user may edit) so explanations can
-- quote the original. canonical_url and content_hash feed cross-source dedupe (JOB-006).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS canonical_url text NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS raw_description text NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_posted_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_canonical_url_idx ON jobs(canonical_url);
CREATE INDEX IF NOT EXISTS jobs_content_hash_idx ON jobs(content_hash);

-- Profile version (JOB-010): bumped on every profile save so each evaluation, and later
-- each generated document, records exactly which facts it was computed from.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- One row per evaluation run of a job against a profile version (spec §7 JobEvaluation).
-- Insert-only: re-evaluating adds a row, so earlier explanations stay inspectable.
-- eligibility is ELIGIBLE / EXCLUDED / UNKNOWN (spec A03), UNKNOWN is never shown as ELIGIBLE.
CREATE TABLE IF NOT EXISTS job_evaluations (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_version integer NOT NULL,
  eligibility text NOT NULL,
  eligibility_reasons jsonb NOT NULL DEFAULT '[]',
  score integer,
  score_breakdown jsonb NOT NULL DEFAULT '{}',
  confidence integer,
  explanation jsonb,
  evidence jsonb NOT NULL DEFAULT '[]',
  model_version text NOT NULL DEFAULT '',
  prompt_version text NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_evaluations_job_id_idx ON job_evaluations(job_id);

-- Insert-only audit trail (spec §7 AuditEvent, acceptance criterion 10). actor is USER,
-- SYSTEM or WORKER, payload must never carry credentials or raw personal data.
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  actor text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  correlation_id text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx ON audit_events(occurred_at);
