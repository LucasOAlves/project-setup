-- We Work Remotely (Milestone 1.5), read from its public RSS feed. Terms reviewed on
-- 2026-10-14 at weworkremotely.com/remote-job-rss-feed are in notes. Applications stay MANUAL.
INSERT INTO sources (id, domain, adapter_type, terms_url, notes) VALUES
  ('weworkremotely', 'weworkremotely.com', 'SEARCH', 'https://weworkremotely.com/remote-job-rss-feed',
   'Public RSS feed, no key. Anyone can use it as long as links point back to We Work Remotely. One feed download per discovery run, filtered by keyword locally.')
ON CONFLICT (id) DO NOTHING
