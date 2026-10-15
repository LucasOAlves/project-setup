import assert from "node:assert/strict";
import test from "node:test";
import { prepareImportedJob } from "./job-import.ts";

const POSTING = {
  externalId: "123",
  title: "Senior Fullstack Engineer",
  url: "https://remotive.com/remote-jobs/software-dev/senior-fullstack-123?utm_source=feed",
  location: "LATAM",
  description: "Build Angular and Node.js products for a distributed team across Latin America.",
};

test("prepareImportedJob keeps the source text and adds provenance", () => {
  const { fields } = prepareImportedJob("remotive", POSTING, "Nimbus");
  assert.equal(fields.rawDescription, POSTING.description);
  assert.equal(fields.canonicalUrl, "https://remotive.com/remote-jobs/software-dev/senior-fullstack-123");
  assert.match(fields.contentHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(fields.normalizedData.regions, ["LATAM"]);
});

test("prepareImportedJob leaves salary and type empty when the source says nothing", () => {
  const { fields } = prepareImportedJob("remotive", POSTING, "Nimbus");
  assert.equal(fields.normalizedData.salary, null);
  assert.equal(fields.salaryMin, null);
  assert.equal(fields.salaryCurrency, "");
  assert.equal(fields.employmentType, null);
  assert.equal(fields.sourcePostedAt, null);
});

test("prepareImportedJob drops the content hash from dedupe keys when the description is thin", () => {
  const thin = prepareImportedJob("remotive", { ...POSTING, description: "Apply now" }, "Nimbus");
  const rich = prepareImportedJob("remotive", POSTING, "Nimbus");
  assert.equal(thin.dedupe.contentHash, null);
  assert.equal(rich.dedupe.contentHash, rich.fields.contentHash);
});
