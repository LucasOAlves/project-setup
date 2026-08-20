CREATE TABLE IF NOT EXISTS professional_personas (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS professional_personas_profile_created_idx
  ON professional_personas (profile_id, created_at DESC);
