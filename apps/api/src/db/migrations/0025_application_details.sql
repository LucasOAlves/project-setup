-- Application details (Job Hunter, Milestone 2): what application forms ask for beyond the
-- profile. One row for the single workspace user, kept apart from profiles so contact details
-- are never part of a model prompt. version goes up on every save, like profiles.version.
CREATE TABLE IF NOT EXISTS application_details (
  id uuid PRIMARY KEY,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  spoken_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_authorization text NOT NULL DEFAULT '',
  requires_visa_sponsorship boolean,
  notice_period text NOT NULL DEFAULT '',
  time_zone text NOT NULL DEFAULT '',
  salary_expectation jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
)
