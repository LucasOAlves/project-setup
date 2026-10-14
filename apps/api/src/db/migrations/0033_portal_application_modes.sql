-- Milestone 3 prepares applications on Greenhouse, Lever and Ashby, and the user submits them:
-- that is ASSISTED. AUTOMATED (the app submits an approved application) is the user's own
-- choice per portal in source settings, together with APPLICATION_SUBMISSION_ENABLED.
UPDATE sources SET application_mode = 'ASSISTED', updated_at = now()
WHERE id IN ('greenhouse', 'lever', 'ashby') AND application_mode = 'MANUAL'
