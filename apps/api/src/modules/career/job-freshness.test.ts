import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobFreshnessSignals } from "./job-freshness.js";

const NOW = new Date("2026-10-14T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const base = {
  url: "https://remotive.com/remote-jobs/software-dev/backend-engineer-123",
  sourcePostedAt: daysAgo(3),
  salaryMin: null,
  salaryMax: null,
};

describe("jobFreshnessSignals", () => {
  it("returns nothing for a recent posting on an aggregator with no salary", () => {
    assert.deepEqual(jobFreshnessSignals(base, NOW), []);
  });

  it("flags a posting whose source gives no date", () => {
    assert.deepEqual(jobFreshnessSignals({ ...base, sourcePostedAt: null }, NOW), ["NO_POSTED_DATE"]);
  });

  it("flags a posting 30 days or older as stale", () => {
    assert.deepEqual(jobFreshnessSignals({ ...base, sourcePostedAt: daysAgo(29) }, NOW), []);
    assert.deepEqual(jobFreshnessSignals({ ...base, sourcePostedAt: daysAgo(30) }, NOW), ["STALE"]);
  });

  it("flags a posting 60 days or older as a likely ghost job instead of stale", () => {
    assert.deepEqual(jobFreshnessSignals({ ...base, sourcePostedAt: daysAgo(60) }, NOW), ["LIKELY_GHOST"]);
    assert.deepEqual(jobFreshnessSignals({ ...base, sourcePostedAt: daysAgo(200) }, NOW), ["LIKELY_GHOST"]);
  });

  it("does not treat a date in the future as stale", () => {
    assert.deepEqual(jobFreshnessSignals({ ...base, sourcePostedAt: daysAgo(-2) }, NOW), []);
  });

  it("highlights a published salary, from either bound", () => {
    assert.deepEqual(jobFreshnessSignals({ ...base, salaryMin: 5000 }, NOW), ["SALARY_PUBLISHED"]);
    assert.deepEqual(jobFreshnessSignals({ ...base, salaryMax: 9000 }, NOW), ["SALARY_PUBLISHED"]);
    assert.deepEqual(jobFreshnessSignals({ ...base, salaryMin: 0, salaryMax: 0 }, NOW), []);
  });

  it("marks a posting whose link is the company's own ATS page", () => {
    for (const url of [
      "https://job-boards.greenhouse.io/acme/jobs/4012345",
      "https://jobs.lever.co/acme/0a1b2c3d",
      "https://jobs.ashbyhq.com/acme/1234-abcd",
      "https://apply.workable.com/acme/j/ABC123/",
      "https://jobs.smartrecruiters.com/Acme/7444",
    ]) {
      assert.deepEqual(jobFreshnessSignals({ ...base, url }, NOW), ["COMPANY_SITE"], url);
    }
  });

  it("lists every signal that applies, in a fixed order", () => {
    assert.deepEqual(
      jobFreshnessSignals(
        { url: "https://jobs.lever.co/acme/0a1b", sourcePostedAt: null, salaryMin: 4000, salaryMax: 6000 },
        NOW,
      ),
      ["NO_POSTED_DATE", "SALARY_PUBLISHED", "COMPANY_SITE"],
    );
  });
});
