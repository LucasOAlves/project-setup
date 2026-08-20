CREATE TABLE IF NOT EXISTS generated_posts (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES content_opportunities(id) ON DELETE CASCADE,
  prompt_version text NOT NULL,
  model text NOT NULL,
  tone text NOT NULL,
  angle text NOT NULL,
  hook text NOT NULL,
  body text NOT NULL,
  story_strategy jsonb NOT NULL,
  writing_review jsonb NOT NULL,
  fact_review jsonb NOT NULL,
  seo_review jsonb NOT NULL,
  quality jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_posts_profile_created_idx
  ON generated_posts (profile_id, created_at DESC);
