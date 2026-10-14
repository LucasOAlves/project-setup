-- The application form the browser worker read on its last run (Milestone 3): each field's
-- label, kind, required flag and options. Page text, stored as data.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS form_snapshot jsonb
