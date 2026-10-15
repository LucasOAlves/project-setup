-- Milestone 5, ticket 1: a sent application moves its job to APPLIED. This backfills the jobs
-- whose application was already SUBMITTED, leaving any job the user moved further untouched.
UPDATE jobs
SET status = 'APPLIED',
    applied_at = COALESCE(jobs.applied_at, applications.submitted_at, applications.updated_at),
    updated_at = now()
FROM applications
WHERE applications.job_id = jobs.id
  AND applications.status = 'SUBMITTED'
  AND jobs.status IN ('SAVED', 'SHORTLISTED', 'PREPARING');

INSERT INTO job_status_events (id, job_id, status, occurred_at)
SELECT gen_random_uuid(), jobs.id, 'APPLIED', COALESCE(applications.submitted_at, applications.updated_at)
FROM jobs
JOIN applications ON applications.job_id = jobs.id
WHERE applications.status = 'SUBMITTED'
  AND jobs.status = 'APPLIED'
  AND NOT EXISTS (SELECT 1 FROM job_status_events e WHERE e.job_id = jobs.id AND e.status = 'APPLIED');
