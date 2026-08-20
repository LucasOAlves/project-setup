CREATE TABLE IF NOT EXISTS opportunity_sets (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  research_run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES professional_personas(id) ON DELETE CASCADE,
  prompt_version text NOT NULL,
  model text NOT NULL,
  selected_opportunity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_sets_profile_created_idx
  ON opportunity_sets (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_opportunities (
  id uuid PRIMARY KEY,
  set_id uuid NOT NULL REFERENCES opportunity_sets(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  match_score integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
