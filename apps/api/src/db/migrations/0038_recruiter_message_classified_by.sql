-- Milestone 5, ticket 4: what classified a recruiter message. RULES, the prompt version when a
-- model answered, or NONE when no model could (the class is then UNCLEAR).
ALTER TABLE recruiter_messages ADD COLUMN IF NOT EXISTS classified_by text NOT NULL DEFAULT '';
