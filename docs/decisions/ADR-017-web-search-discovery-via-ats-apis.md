# ADR-017 — Web search finds postings, the ATS public APIs supply them

## Status

Accepted

## Context

The most productive way to find international remote roles open to a Brazil-based engineer is
to search the companies' own applicant tracking systems (Ashby, Greenhouse, Lever, Workable,
SmartRecruiters) with Google's `site:` operator: the posting appears there first, with its real
publication date and often its pay range, before aggregators and LinkedIn repost it. The user
asked for this search to run directly from Job Hunter.

Three facts constrain it. Google's Custom Search JSON API stopped taking new customers in
January 2026 and shuts down on 1 January 2027. Scraping Google's result pages breaks Google's
terms and the spec's rule to use only permitted sources, and would mean evading CAPTCHAs.
Search results are untrusted web content.

## Options considered

1. Google Custom Search JSON API.
2. Scrape Google result pages, directly or through a paid SERP reseller.
3. A search API with its own index (Brave Search API) for the `site:` queries, using each
   result only as a pointer: recognize the ATS and company from the URL, then read the posting
   from that ATS's public API.
4. No web search: rely on the target-company watchlist and the aggregator feeds.

## Decision

Option 3, with the watchlist (option 4) alongside it:

- `web-search-discovery.ts` (pure, test-first per ADR-014) builds one query per ATS domain with
  the configured titles, LATAM terms and `-"authorized to work in the US"`, within Brave's 400
  character and 50 word limits, groups result URLs by board with `detectBoardReference`, and
  keeps only the board postings whose id or URL the results point at.
- `WebDiscoveryService` runs daily in the worker as discovery source `brave`, only when
  `BRAVE_SEARCH_API_KEY` is set: six searches with the past-week filter, about one a second,
  then one public board read per company found. Postings are stored with the ATS as their
  source and go through the same intake, eligibility and evaluation path as other discovery.
- Nothing from the search result itself (title, snippet) is stored or shown.

## Consequences

- Six paid searches a day, about 180 a month, which fits inside Brave's monthly credit at
  US$5 per 1,000 searches. The count does not grow with the title list.
- Every posting's content, date and pay come from the company's ATS, so they are as reliable as
  the watchlist's, and a posting the search found can be deduped against one the watchlist or a
  manual import already brought in.
- Brave's index is smaller than Google's, so some postings Google would find are missed. The
  watchlist covers the companies the user already cares about regardless.
- A whole board is fetched to keep a few postings. That is one request per company per day,
  within the courtesy limit the watchlist uses.
- Brave's terms of use have not been reviewed yet. The source is registered as `brave` and can
  be turned off in source settings like any other.

## Tradeoffs

Option 1 is closed to new users and ends within months. Option 2 is the closest to Google's
results but violates the spec and Google's terms, and a reseller only moves that risk. Option 4
is free and needs no new vendor, but only finds companies the user already knows, which loses
the main value of the search: discovering new ones. Option 3 costs a small subscription and
reaches fewer pages than Google, in exchange for an official API and content that always comes
from the source.
