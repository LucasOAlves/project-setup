-- Talent-platform checklist (Milestone 1.5): where the user stands on each platform in the
-- job-site catalog (packages/shared/src/job-sites.ts), one row per platform once touched.
CREATE TABLE IF NOT EXISTS talent_platform_profiles (
  site_id text PRIMARY KEY,
  status text NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
)
