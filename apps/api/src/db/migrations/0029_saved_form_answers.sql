-- Answers the user gave to application-form questions (Milestone 3), keyed by the question's
-- normalized wording so the same question on another form is answered the same way. The field
-- plan is what the last run decided to put in each field of the form it read.
CREATE TABLE IF NOT EXISTS saved_form_answers (
  question_key text PRIMARY KEY,
  label text NOT NULL,
  answer text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS field_plan jsonb
