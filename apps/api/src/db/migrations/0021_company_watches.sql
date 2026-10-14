-- Target-company watchlist (Milestone 1.5). One row per watched company: which ATS board to
-- read and what the last poll found. Polled daily by the worker, at most once an hour.
CREATE TABLE IF NOT EXISTS company_watches (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  source text NOT NULL,
  board_token text NOT NULL,
  last_polled_at timestamptz,
  last_status text NOT NULL DEFAULT 'NEVER',
  last_error text NOT NULL DEFAULT '',
  open_postings integer,
  recent_postings integer,
  new_postings integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
