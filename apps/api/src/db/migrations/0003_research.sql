CREATE TABLE IF NOT EXISTS research_runs (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES professional_personas(id) ON DELETE CASCADE,
  query_topics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_runs_profile_created_idx
  ON research_runs (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS news_articles (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL,
  url text NOT NULL,
  published_at timestamptz NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text NOT NULL,
  provider_article_id text NOT NULL
);

CREATE INDEX IF NOT EXISTS news_articles_run_idx ON news_articles (run_id);
