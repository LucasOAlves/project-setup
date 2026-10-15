-- Milestone 5, ticket 7: the model and search cost ledger (spec JOB-028). One row per model call
-- or search query, with the estimated cost from the price table in code (cost-estimate.ts).
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  purpose text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL DEFAULT '',
  prompt_version text NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  queries integer NOT NULL DEFAULT 0,
  estimated_usd numeric(12, 6) NOT NULL DEFAULT 0,
  price_known boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage (created_at);
