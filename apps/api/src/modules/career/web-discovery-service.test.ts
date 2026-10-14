import assert from "node:assert/strict";
import test from "node:test";
import { providerUnavailable } from "../../app-error.ts";
import type { WebSearchClient } from "./brave-search-client.ts";
import type { JobIntake } from "./job-intake.ts";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.ts";
import { discoverySourceIds, WebDiscoveryService } from "./web-discovery-service.ts";

function posting(id: string, url: string, company = ""): NormalizedJobPosting {
  return { externalId: id, title: "Engineer", url, location: "", description: "", companyNameFromSource: company, updatedAt: new Date(0) };
}

function setup(options: { searchFails?: boolean; boardFails?: boolean } = {}) {
  const queries: string[] = [];
  const imported: Array<{ source: string; companyName: string; externalId: string }> = [];
  const queued: string[] = [];
  const allowed: string[] = [];
  const search: WebSearchClient = {
    search: async (query) => {
      queries.push(query);
      if (options.searchFails) throw providerUnavailable("Brave Search is unavailable.");
      if (query.startsWith("site:jobs.ashbyhq.com")) {
        return [
          { url: "https://jobs.ashbyhq.com/acme-labs/abc-1", title: "" },
          { url: "https://example.com/not-an-ats", title: "" },
        ];
      }
      if (query.startsWith("site:boards.greenhouse.io")) {
        return [{ url: "https://boards.greenhouse.io/globex/jobs/77", title: "" }];
      }
      return [];
    },
  };
  const ashby: JobProvider = {
    listJobs: async () => {
      if (options.boardFails) throw providerUnavailable("down");
      return [posting("abc-1", "https://jobs.ashbyhq.com/acme-labs/abc-1"), posting("other", "https://jobs.ashbyhq.com/acme-labs/other")];
    },
  };
  const greenhouse: JobProvider = { listJobs: async () => [posting("77", "https://boards.greenhouse.io/globex/jobs/77", "Globex")] };
  const intake = {
    importSearchPosting: async (source: string, item: NormalizedJobPosting & { companyName: string }) => {
      imported.push({ source, companyName: item.companyName, externalId: item.externalId });
      return { job: { id: `job-${item.externalId}` }, outcome: "CREATED" };
    },
    evaluateEligibility: async () => ({ eligibility: "UNKNOWN", profileVersion: 1 }),
  } as unknown as JobIntake;
  const service = new WebDiscoveryService({
    search,
    intake,
    providers: { ashby, greenhouse } as never,
    sourceGate: {
      assertDiscoveryAllowed: async (id) => {
        allowed.push(id);
      },
    },
    queueEvaluation: async (jobId) => {
      queued.push(jobId);
    },
    sleep: async () => {},
  });
  return { service, queries, imported, queued, allowed };
}

test("runs one search per ATS domain and imports only the postings the results point at", async () => {
  const { service, queries, imported, queued, allowed } = setup();

  const result = await service.run(["senior software engineer"]);

  assert.equal(queries.length, 6);
  assert.equal(result.resultUrls, 3);
  assert.equal(result.boards, 2);
  assert.deepEqual(imported, [
    { source: "ashby", companyName: "Acme Labs", externalId: "abc-1" },
    { source: "greenhouse", companyName: "Globex", externalId: "77" },
  ]);
  assert.deepEqual(queued, ["job-abc-1", "job-77"]);
  assert.deepEqual(allowed, ["brave", "ashby", "greenhouse"]);
});

test("a board that cannot be read is reported and the run goes on", async () => {
  const { service, imported } = setup({ boardFails: true });
  const result = await service.run(["ai engineer"]);
  assert.deepEqual(result.failedBoards, ["ashby/acme-labs"]);
  assert.deepEqual(imported.map((item) => item.externalId), ["77"]);
});

test("when every search fails the run throws so the queue retries it", async () => {
  const { service } = setup({ searchFails: true });
  await assert.rejects(() => service.run(["ai engineer"]), /every web search request failed/);
});

test("web search joins the daily sources only when its key is set", () => {
  assert.deepEqual(discoverySourceIds({ DISCOVERY_SOURCES: ["remotive"], BRAVE_SEARCH_API_KEY: "" }), ["remotive"]);
  assert.deepEqual(discoverySourceIds({ DISCOVERY_SOURCES: ["remotive"], BRAVE_SEARCH_API_KEY: "k" }), ["remotive", "brave"]);
});
