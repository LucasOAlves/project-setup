-- Two remote-focused search sources for Job Hunter (JOB-005), with the terms reviewed on
-- 2026-10-14 recorded in notes. Both stay MANUAL for applications.
INSERT INTO sources (id, domain, adapter_type, terms_url, notes) VALUES
  ('remotive', 'remotive.com', 'SEARCH', 'https://github.com/remotive-com/remote-jobs-api',
   'Public API, no key. Link back to the Remotive URL and name Remotive as the source. Do not resubmit jobs to third-party boards. Max 2 requests per minute, a few fetches per day suggested. Listings delayed 24h.'),
  ('himalayas', 'himalayas.app', 'SEARCH', 'https://himalayas.app/docs/remote-jobs-api',
   'Public API, no key. Show a visible link to himalayas.app and say the data comes from Himalayas. Rate limited (429), data refreshed every 24h.')
ON CONFLICT (id) DO NOTHING
