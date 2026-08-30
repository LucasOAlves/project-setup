ALTER TABLE generated_posts ADD COLUMN status text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE generated_posts ADD COLUMN published_at timestamptz;
ALTER TABLE generated_posts ADD COLUMN outcome text;
ALTER TABLE generated_posts ADD COLUMN outcome_notes text;
