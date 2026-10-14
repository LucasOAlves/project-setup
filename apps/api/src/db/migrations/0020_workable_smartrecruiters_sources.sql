-- Two more ATS board sources (Milestone 1.5), both read through their public, unauthenticated
-- careers endpoints, one company per request. Applications stay MANUAL.
INSERT INTO sources (id, domain, adapter_type, terms_url, notes) VALUES
  ('workable', 'apply.workable.com', 'BOARD', '',
   'Public careers-widget endpoint, the same data the company careers page shows. One request per company per import. Terms not reviewed yet.'),
  ('smartrecruiters', 'jobs.smartrecruiters.com', 'BOARD', 'https://developers.smartrecruiters.com/docs/endpoints',
   'Public Posting API, no key. One list request plus one detail request per posting, at most 100 postings per import.')
ON CONFLICT (id) DO NOTHING
