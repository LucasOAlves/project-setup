CREATE TABLE IF NOT EXISTS content_plan_topics (
  id uuid PRIMARY KEY,
  topic_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PLANNED',
  content_opportunity_id uuid REFERENCES content_opportunities(id) ON DELETE SET NULL,
  generated_post_id uuid REFERENCES generated_posts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
