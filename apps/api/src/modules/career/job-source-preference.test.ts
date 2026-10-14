import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companySiteUpgrade,
  findCrossSourceMatch,
  isCompanyBoardSource,
  normalizeRoleTitle,
} from "./job-source-preference.js";

describe("isCompanyBoardSource", () => {
  it("knows the ATS board sources from the aggregators", () => {
    for (const source of ["greenhouse", "lever", "ashby", "workable", "smartrecruiters"]) {
      assert.equal(isCompanyBoardSource(source), true, source);
    }
    for (const source of ["remotive", "remoteok", "himalayas", "weworkremotely", "adzuna", "arbeitnow", "manual"]) {
      assert.equal(isCompanyBoardSource(source), false, source);
    }
  });
});

describe("normalizeRoleTitle", () => {
  it("ignores case, punctuation, spacing and a remote marker", () => {
    assert.equal(normalizeRoleTitle("Senior Backend Engineer (Remote)"), "senior backend engineer");
    assert.equal(normalizeRoleTitle("  senior   backend-engineer - remote "), "senior backend engineer");
    assert.equal(normalizeRoleTitle("Sr. Backend Engineer, Remote, LATAM"), "sr backend engineer latam");
  });

  it("keeps words that tell roles apart", () => {
    assert.notEqual(normalizeRoleTitle("Senior Backend Engineer"), normalizeRoleTitle("Backend Engineer"));
    assert.notEqual(normalizeRoleTitle("Backend Engineer, Payments"), normalizeRoleTitle("Backend Engineer, Search"));
  });
});

describe("findCrossSourceMatch", () => {
  const aggregatorCopy = { id: "j1", source: "remotive", title: "Senior Backend Engineer (Remote)" };
  const atsRecord = { id: "j2", source: "greenhouse", title: "Senior Backend Engineer" };

  it("matches an ATS posting to the one aggregator copy of the same role at the same company", () => {
    assert.equal(findCrossSourceMatch({ source: "greenhouse", title: "Senior Backend Engineer" }, [aggregatorCopy]), aggregatorCopy);
  });

  it("matches an aggregator posting to the ATS record already tracked", () => {
    assert.equal(findCrossSourceMatch({ source: "remoteok", title: "Senior Backend Engineer" }, [atsRecord]), atsRecord);
  });

  it("never matches two postings from the same side", () => {
    assert.equal(findCrossSourceMatch({ source: "lever", title: "Senior Backend Engineer" }, [atsRecord]), null);
    assert.equal(findCrossSourceMatch({ source: "himalayas", title: "Senior Backend Engineer" }, [aggregatorCopy]), null);
  });

  it("leaves manual jobs alone", () => {
    const manual = { id: "j3", source: "manual", title: "Senior Backend Engineer" };
    assert.equal(findCrossSourceMatch({ source: "greenhouse", title: "Senior Backend Engineer" }, [manual]), null);
  });

  it("does not match a different title", () => {
    assert.equal(findCrossSourceMatch({ source: "greenhouse", title: "Backend Engineer" }, [aggregatorCopy]), null);
  });

  it("does not guess when two candidates share the title", () => {
    const second = { id: "j4", source: "remoteok", title: "Senior Backend Engineer" };
    assert.equal(findCrossSourceMatch({ source: "greenhouse", title: "Senior Backend Engineer" }, [aggregatorCopy, second]), null);
  });
});

describe("companySiteUpgrade", () => {
  const existing = {
    source: "remotive",
    url: "https://remotive.com/remote-jobs/software-dev/senior-backend-engineer-123",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    sourcePostedAt: null,
    normalizedData: { version: 1, salary: null, regions: ["WORLDWIDE"] },
  };
  const incoming = {
    source: "greenhouse",
    url: "https://job-boards.greenhouse.io/acme/jobs/4012345",
    salaryMin: 6000,
    salaryMax: 8000,
    salaryCurrency: "USD",
    sourcePostedAt: new Date("2026-10-10T00:00:00Z"),
    normalizedData: { version: 1, salary: { min: 6000, max: 8000, currency: "USD", period: "month" } },
  };

  it("points an aggregator copy at the company's own posting and fills what it lacks", () => {
    assert.deepEqual(companySiteUpgrade(existing, incoming), {
      url: incoming.url,
      salaryMin: 6000,
      salaryMax: 8000,
      salaryCurrency: "USD",
      sourcePostedAt: incoming.sourcePostedAt,
      normalizedData: { version: 1, salary: incoming.normalizedData.salary, regions: ["WORLDWIDE"] },
    });
  });

  it("keeps a salary and date the aggregator copy already has", () => {
    const withData = {
      ...existing,
      salaryMin: 5000,
      salaryMax: 7000,
      salaryCurrency: "USD",
      sourcePostedAt: new Date("2026-10-01T00:00:00Z"),
    };
    assert.deepEqual(companySiteUpgrade(withData, incoming), { url: incoming.url });
  });

  it("changes nothing when the tracked job is already the ATS record, or the new one is not", () => {
    assert.equal(companySiteUpgrade({ ...existing, source: "lever" }, incoming), null);
    assert.equal(companySiteUpgrade(existing, { ...incoming, source: "remoteok" }), null);
  });

  it("changes nothing when the aggregator already links to the same posting", () => {
    assert.equal(
      companySiteUpgrade({ ...existing, url: incoming.url, salaryMin: 1, salaryMax: 2, sourcePostedAt: new Date() }, incoming),
      null,
    );
  });
});
