-- Normalized view of each imported job (spec §7 Job.normalizedData, JOB-006): salary in USD
-- per month, region tokens and employment type, as produced by job-normalization.ts.
-- Rows imported before this migration keep the empty object until they are re-imported.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS normalized_data jsonb NOT NULL DEFAULT '{}'
