import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import {
  matchesKeywords,
  parseWeWorkRemotelyFeed,
  WeWorkRemotelyJobSearchProvider,
} from "./weworkremotely-job-search-provider.ts";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>We Work Remotely: Full-Stack Programming Jobs</title>
    <item>
      <title>Nimbus Labs: Senior Full-Stack Engineer (TypeScript)</title>
      <region>Anywhere in the World</region>
      <country></country>
      <state></state>
      <skills>TypeScript, Node.js</skills>
      <category>Full-Stack Programming</category>
      <type>Full-Time</type>
      <description><![CDATA[<p><strong>Headquarters:</strong> Remote</p><p>Build our platform with TypeScript &amp; Node.js.</p>]]></description>
      <pubDate>Wed, 14 Oct 2026 07:31:00 +0000</pubDate>
      <expires_at>Fri, 13 Nov 2026 07:31:00 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/nimbus-labs-senior-full-stack-engineer-typescript</guid>
      <link>https://weworkremotely.com/remote-jobs/nimbus-labs-senior-full-stack-engineer-typescript</link>
    </item>
    <item>
      <title>Acme &amp; Co: Backend Engineer</title>
      <region>USA Only</region>
      <country>United States</country>
      <type>Contract</type>
      <description>&lt;p&gt;Python services.&lt;/p&gt;</description>
      <pubDate>Tue, 13 Oct 2026 10:00:00 +0000</pubDate>
      <guid>https://weworkremotely.com/remote-jobs/acme-co-backend-engineer</guid>
      <link>https://weworkremotely.com/remote-jobs/acme-co-backend-engineer</link>
    </item>
    <item>
      <title>No link here</title>
    </item>
  </channel>
</rss>`;

test("parses each item into a posting, splitting company and title", () => {
  const postings = parseWeWorkRemotelyFeed(FEED);
  assert.equal(postings.length, 2);
  const [first, second] = postings;
  assert.equal(first?.externalId, "nimbus-labs-senior-full-stack-engineer-typescript");
  assert.equal(first?.companyNameFromSource, "Nimbus Labs");
  assert.equal(first?.title, "Senior Full-Stack Engineer (TypeScript)");
  assert.equal(first?.url, "https://weworkremotely.com/remote-jobs/nimbus-labs-senior-full-stack-engineer-typescript");
  assert.equal(first?.location, "Anywhere in the World");
  assert.equal(first?.employmentType, "Full-Time");
  assert.equal(first?.postedAt?.toISOString(), "2026-10-14T07:31:00.000Z");
  assert.equal(first?.description, "Headquarters: Remote Build our platform with TypeScript & Node.js.\nSkills: TypeScript, Node.js");
  assert.equal(second?.companyNameFromSource, "Acme & Co");
  assert.equal(second?.location, "USA Only, United States");
  assert.equal(second?.description, "Python services.");
});

test("a title without a company prefix keeps the whole title", () => {
  const [posting] = parseWeWorkRemotelyFeed(
    "<rss><channel><item><title>Engineer</title><link>https://weworkremotely.com/remote-jobs/x</link></item></channel></rss>",
  );
  assert.equal(posting?.title, "Engineer");
  assert.equal(posting?.companyNameFromSource, "");
});

test("keyword matching needs every word, in the title, skills or description, ignoring case", () => {
  const [posting] = parseWeWorkRemotelyFeed(FEED);
  assert.ok(posting);
  assert.equal(matchesKeywords(posting, "typescript"), true);
  assert.equal(matchesKeywords(posting, "Node.js engineer"), true);
  assert.equal(matchesKeywords(posting, "angular"), false);
  assert.equal(matchesKeywords(posting, "java"), false);
  assert.equal(matchesKeywords(posting, "  "), true);
});

test("searchJobs reads the programming feed once for several keywords and filters it", async () => {
  let calls = 0;
  const provider = new WeWorkRemotelyJobSearchProvider(async (input) => {
    calls += 1;
    assert.equal(String(input), "https://weworkremotely.com/categories/remote-programming-jobs.rss");
    return new Response(FEED, { headers: { "content-type": "application/rss+xml" } });
  });

  assert.deepEqual(
    (await provider.searchJobs({ keywords: "typescript" })).map((posting) => posting.externalId),
    ["nimbus-labs-senior-full-stack-engineer-typescript"],
  );
  assert.equal((await provider.searchJobs({ keywords: "python" })).length, 1);
  assert.equal(calls, 1);
});

test("a failed feed maps to provider-unavailable", async () => {
  const provider = new WeWorkRemotelyJobSearchProvider(async () => new Response("down", { status: 503 }));
  await assert.rejects(
    () => provider.searchJobs({ keywords: "typescript" }),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});
