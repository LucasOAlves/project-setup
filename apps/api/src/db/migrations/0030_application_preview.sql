-- The last run's preview (Milestone 3): a screenshot of the filled form with typed values
-- masked, what the page confirmed, and the payload hash Milestone 4's approval binds to.
-- Screenshots are deleted after 30 days, and the preview keeps its counts.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS preview jsonb;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS payload_hash text
