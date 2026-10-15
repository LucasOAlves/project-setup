import assert from "node:assert/strict";
import test from "node:test";
import { DiscoveryService } from "./discovery.ts";
import type { NormalizedJobPosting } from "./job-provider.ts";

function posting(id: string): NormalizedJobPosting {
  return {
    externalId: id,
    title: `Role ${id}`,
    url: `https://x/${id}`,
    location: "LATAM",
    description: "",
    companyNameFromSource: "Nimbus",
    updatedAt: new Date(),
  };
}

type Outcome = "CREATED" | "ALREADY_IMPORTED" | "DUPLICATE";

function fakeIntake(outcomes: Record<string, Outcome>, eligibility: Record<string, string>) {
  const evaluated: string[] = [];
  return {
    evaluated,
    intake: {
      async importSearchPosting(_source: string, p: { externalId: string }) {
        return { job: { id: `job-${p.externalId}` }, outcome: outcomes[p.externalId] ?? "CREATED" };
      },
      async evaluateEligibility(job: { id: string }) {
        evaluated.push(job.id);
        return { eligibility: eligibility[job.id] ?? "UNKNOWN", profileVersion: 3 };
      },
    } as never,
  };
}

const allowAll = { async assertDiscoveryAllowed() {} };

test("runSource imports, evaluates new jobs and queues all but the excluded ones", async () => {
  const { intake, evaluated } = fakeIntake(
    { "2": "ALREADY_IMPORTED", "3": "DUPLICATE" },
    { "job-1": "ELIGIBLE", "job-4": "EXCLUDED", "job-5": "UNKNOWN" },
  );
  const queued: Array<[string, number]> = [];
  const service = new DiscoveryService({
    intake,
    providers: { remotive: { async searchJobs() { return ["1", "2", "3", "4", "5"].map(posting); } } },
    sourceGate: allowAll,
    queueEvaluation: async (jobId, version) => {
      queued.push([jobId, version]);
    },
    sleep: async () => {},
  });

  const result = await service.runSource("remotive", ["typescript"]);

  assert.equal(result.fetched, 5);
  assert.equal(result.created, 3);
  assert.equal(result.alreadyImported, 1);
  assert.equal(result.duplicates, 1);
  assert.deepEqual([result.eligible, result.excluded, result.unknown], [1, 1, 1]);
  assert.deepEqual(evaluated, ["job-1", "job-4", "job-5"]);
  assert.deepEqual(queued, [["job-1", 3], ["job-5", 3]]);
});

test("runSource merges keyword results by external id and spaces requests per source", async () => {
  const sleeps: number[] = [];
  const service = new DiscoveryService({
    intake: fakeIntake({}, {}).intake,
    providers: {
      remotive: {
        async searchJobs({ keywords }) {
          return keywords === "angular" ? [posting("1"), posting("2")] : [posting("2"), posting("3")];
        },
      },
    },
    sourceGate: allowAll,
    queueEvaluation: async () => {},
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  const result = await service.runSource("remotive", ["angular", "node.js", "tech lead"]);

  assert.equal(result.fetched, 3);
  assert.deepEqual(sleeps, [35_000, 35_000]);
});

test("runSource keeps going when one keyword fails and reports it", async () => {
  const service = new DiscoveryService({
    intake: fakeIntake({}, {}).intake,
    providers: {
      himalayas: {
        async searchJobs({ keywords }) {
          if (keywords === "broken") throw new Error("503");
          return [posting("1")];
        },
      },
    },
    sourceGate: allowAll,
    queueEvaluation: async () => {},
    sleep: async () => {},
  });

  const result = await service.runSource("himalayas", ["broken", "typescript"]);

  assert.deepEqual(result.failedKeywords, ["broken"]);
  assert.equal(result.created, 1);
});

test("runSource throws when every request fails, so the queue retries it", async () => {
  const service = new DiscoveryService({
    intake: fakeIntake({}, {}).intake,
    providers: { himalayas: { async searchJobs() { throw new Error("503"); } } },
    sourceGate: allowAll,
    queueEvaluation: async () => {},
    sleep: async () => {},
  });

  await assert.rejects(() => service.runSource("himalayas", ["a", "b"]), /every discovery request failed/);
});

test("runSource refuses a source the registry has turned off before calling it", async () => {
  const service = new DiscoveryService({
    intake: fakeIntake({}, {}).intake,
    providers: { remotive: { async searchJobs() { assert.fail("must not call a disabled source"); } } },
    sourceGate: {
      async assertDiscoveryAllowed() {
        throw new Error("remotive is turned off in source settings.");
      },
    },
    queueEvaluation: async () => {},
    sleep: async () => {},
  });

  await assert.rejects(() => service.runSource("remotive", ["typescript"]), /turned off/);
});
