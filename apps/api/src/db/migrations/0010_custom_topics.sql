CREATE TABLE IF NOT EXISTS custom_topics (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  hook text NOT NULL,
  objective text NOT NULL DEFAULT '',
  key_points jsonb NOT NULL DEFAULT '[]',
  cta text NOT NULL DEFAULT '',
  angle text NOT NULL DEFAULT 'EDUCATIONAL',
  pillar text NOT NULL DEFAULT '',
  source_url text,
  status text NOT NULL DEFAULT 'PLANNED',
  content_opportunity_id uuid REFERENCES content_opportunities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
