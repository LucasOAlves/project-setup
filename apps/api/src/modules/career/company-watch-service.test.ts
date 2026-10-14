import assert from "node:assert/strict";
import test from "node:test";
import { providerUnavailable } from "../../app-error.ts";
import type { CareerRepository } from "./career-repository.ts";
import { CompanyWatchPoller } from "./company-watch-service.ts";
import type { JobIntake } from "./job-intake.ts";
import type { JobProvider, NormalizedJobPosting } from "./job-provider.ts";

const NOW = new Date("2026-10-14T12:00:00Z");
const COMPANY = { id: "c1", name: "Acme" };

function posting(id: string, daysAgo: number | null): NormalizedJobPosting {
  return {
    externalId: id,
    title: `Engineer ${id}`,
    url: `https://jobs.ashbyhq.com/acme/${id}`,
    location: "Remote",
    description: "",
    companyNameFromSource: "",
    updatedAt: NOW,
    postedAt: daysAgo === null ? null : new Date(NOW.getTime() - daysAgo * 86_400_000),
  };
}

function setup(options: {
  watch?: { lastPolledAt: Date | null } | null;
  postings?: NormalizedJobPosting[];
  fail?: boolean;
  outcomes?: Record<string, "CREATED" | "ALREADY_IMPORTED" | "DUPLICATE">;
  excluded?: string[];
}) {
  const recorded: unknown[] = [];
  const queued: string[] = [];
  const watch = options.watch === undefined ? { lastPolledAt: null } : options.watch;
  const repo = {
    getCompanyWatch: async () => (watch ? { companyId: COMPANY.id, source: "ashby", boardToken: "acme", ...watch } : null),
    getCompany: async () => COMPANY,
    listCompanyWatches: async () => [],
    recordCompanyWatchPoll: async (_id: string, result: unknown) => {
      recorded.push(result);
      return null;
    },
  } as unknown as CareerRepository;
  const intake = {
    importBoardPosting: async (_source: string, item: NormalizedJobPosting) => ({
      job: { id: `job-${item.externalId}` },
      outcome: options.outcomes?.[item.externalId] ?? "CREATED",
    }),
    evaluateEligibility: async (job: { id: string }) => ({
      eligibility: options.excluded?.includes(job.id) ? "EXCLUDED" : "UNKNOWN",
      profileVersion: 2,
    }),
  } as unknown as JobIntake;
  const provider: JobProvider = {
    listJobs: async () => {
      if (options.fail) throw providerUnavailable("The Ashby job board is unavailable.");
      return options.postings ?? [];
    },
  };
  const poller = new CompanyWatchPoller({
    repo,
    intake,
    providers: { ashby: provider } as never,
    sourceGate: { assertDiscoveryAllowed: async () => {} },
    queueEvaluation: async (jobId) => {
      queued.push(jobId);
    },
  });
  return { poller, recorded, queued };
}

test("a company that is not watched is not polled", async () => {
  const { poller, recorded } = setup({ watch: null });
  assert.equal((await poller.poll(COMPANY.id, NOW)).status, "NOT_WATCHED");
  assert.equal(recorded.length, 0);
});

test("a company polled less than an hour ago is skipped", async () => {
  const { poller, recorded } = setup({ watch: { lastPolledAt: new Date(NOW.getTime() - 30 * 60_000) } });
  assert.equal((await poller.poll(COMPANY.id, NOW)).status, "SKIPPED_RECENT");
  assert.equal(recorded.length, 0);
});

test("a poll imports new jobs, queues the ones not excluded and records the hiring pace", async () => {
  const { poller, recorded, queued } = setup({
    postings: [posting("1", 1), posting("2", 2), posting("3", 3), posting("4", 4), posting("5", 5), posting("6", null)],
    outcomes: { "5": "ALREADY_IMPORTED", "6": "DUPLICATE" },
    excluded: ["job-4"],
  });

  const result = await poller.poll(COMPANY.id, NOW);

  assert.equal(result.status, "POLLED");
  assert.equal(result.fetched, 6);
  assert.equal(result.created, 4);
  assert.equal(result.alreadyImported, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.excluded, 1);
  assert.deepEqual(queued, ["job-1", "job-2", "job-3"]);
  assert.equal(result.hiringFast, true);
  assert.deepEqual(recorded, [{ status: "OK", polledAt: NOW, openPostings: 6, recentPostings: 5, newPostings: 4 }]);
});

test("a failed board read is recorded and rethrown so the queue retries", async () => {
  const { poller, recorded } = setup({ fail: true });
  await assert.rejects(() => poller.poll(COMPANY.id, NOW));
  assert.deepEqual(recorded, [{ status: "FAILED", polledAt: NOW, error: "The Ashby job board is unavailable." }]);
});
