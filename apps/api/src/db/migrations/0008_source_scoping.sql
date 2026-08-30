ALTER TABLE research_runs ADD COLUMN source text NOT NULL DEFAULT 'discover';
ALTER TABLE opportunity_sets ADD COLUMN source text NOT NULL DEFAULT 'discover';
