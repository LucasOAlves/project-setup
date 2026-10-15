-- Consent boxes the user ticked for one application (Milestone 3). Unlike other answers they are
-- never reused on another form.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS agreed jsonb NOT NULL DEFAULT '[]'::jsonb
