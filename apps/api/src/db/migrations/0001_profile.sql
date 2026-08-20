-- Slice 1: profile, experiences, writing samples, uploaded photos

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  current_job_title text NOT NULL DEFAULT '',
  current_company text NOT NULL DEFAULT '',
  about text NOT NULL DEFAULT '',
  top_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
  industries jsonb NOT NULL DEFAULT '[]'::jsonb,
  years_of_experience integer,
  architecture_experience text NOT NULL DEFAULT '',
  leadership_experience text NOT NULL DEFAULT '',
  business_impact text NOT NULL DEFAULT '',
  subjects_of_interest jsonb NOT NULL DEFAULT '[]'::jsonb,
  subjects_to_avoid jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_audience text NOT NULL DEFAULT '',
  preferred_language text NOT NULL DEFAULT 'English',
  positioning jsonb NOT NULL DEFAULT '[]'::jsonb,
  desired_perception text NOT NULL DEFAULT '',
  writing_tones jsonb NOT NULL DEFAULT '[]'::jsonb,
  post_length text NOT NULL DEFAULT 'MEDIUM',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS professional_experiences (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  start_period text NOT NULL DEFAULT '',
  end_period text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  responsibilities text NOT NULL DEFAULT '',
  achievements text NOT NULL DEFAULT '',
  technologies jsonb NOT NULL DEFAULT '[]'::jsonb,
  measurable_outcomes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS writing_samples (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS uploaded_photos (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
