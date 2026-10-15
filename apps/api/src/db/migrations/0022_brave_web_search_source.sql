-- Web search discovery (Milestone 1.5) through the Brave Search API. Only result URLs are
-- used, to find postings on ATS boards, whose content comes from the ATS public APIs.
INSERT INTO sources (id, domain, adapter_type, terms_url, notes) VALUES
  ('brave', 'api.search.brave.com', 'SEARCH', '',
   'Paid API, key in BRAVE_SEARCH_API_KEY. Six searches a day (one per ATS domain), about one request a second. Result URLs only, nothing from the results is stored. Terms not reviewed yet.')
ON CONFLICT (id) DO NOTHING
