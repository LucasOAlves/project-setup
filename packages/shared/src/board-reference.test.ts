import assert from "node:assert/strict";
import test from "node:test";
import { detectBoardReference } from "./board-reference.ts";

test("recognizes both Greenhouse board domains and the API host", () => {
  assert.deepEqual(detectBoardReference("https://boards.greenhouse.io/acme"), { source: "greenhouse", token: "acme" });
  assert.deepEqual(detectBoardReference("https://job-boards.greenhouse.io/acme/jobs/4012345"), {
    source: "greenhouse",
    token: "acme",
  });
  assert.deepEqual(detectBoardReference("https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true"), {
    source: "greenhouse",
    token: "acme",
  });
});

test("reads the token from a Greenhouse embed URL", () => {
  assert.deepEqual(detectBoardReference("https://boards.greenhouse.io/embed/job_board?for=acme&b=https://acme.com"), {
    source: "greenhouse",
    token: "acme",
  });
});

test("recognizes Lever and Ashby posting and board URLs", () => {
  assert.deepEqual(detectBoardReference("https://jobs.lever.co/acme/1f2e3d4c-aaaa-bbbb-cccc-123456789abc"), {
    source: "lever",
    token: "acme",
  });
  assert.deepEqual(detectBoardReference("https://jobs.ashbyhq.com/acme"), { source: "ashby", token: "acme" });
  assert.deepEqual(detectBoardReference("https://jobs.ashbyhq.com/Acme%20Labs/abc/application"), {
    source: "ashby",
    token: "Acme Labs",
  });
});

test("recognizes Workable and SmartRecruiters board and posting URLs", () => {
  assert.deepEqual(detectBoardReference("https://apply.workable.com/acme/j/ABC123DEF/"), { source: "workable", token: "acme" });
  assert.deepEqual(detectBoardReference("https://acme.workable.com/jobs/123456"), { source: "workable", token: "acme" });
  assert.deepEqual(detectBoardReference("https://jobs.smartrecruiters.com/AcmeInc/744000012345678-senior-engineer"), {
    source: "smartrecruiters",
    token: "AcmeInc",
  });
  assert.deepEqual(detectBoardReference("https://careers.smartrecruiters.com/AcmeInc"), {
    source: "smartrecruiters",
    token: "AcmeInc",
  });
  assert.equal(detectBoardReference("https://www.workable.com/pricing"), null);
  assert.equal(detectBoardReference("https://apply.workable.com/"), null);
});

test("accepts a URL pasted without the scheme, with www or in another case", () => {
  assert.deepEqual(detectBoardReference("  jobs.lever.co/acme  "), { source: "lever", token: "acme" });
  assert.deepEqual(detectBoardReference("HTTPS://Boards.Greenhouse.io/acme/"), { source: "greenhouse", token: "acme" });
});

test("returns null for a bare token, an unknown host or a board URL with no slug", () => {
  assert.equal(detectBoardReference("acme"), null);
  assert.equal(detectBoardReference(""), null);
  assert.equal(detectBoardReference("https://acme.com/careers"), null);
  assert.equal(detectBoardReference("https://jobs.lever.co/"), null);
  assert.equal(detectBoardReference("https://boards.greenhouse.io/embed/job_board"), null);
  assert.equal(detectBoardReference("https://notgreenhouse.io/acme"), null);
  assert.equal(detectBoardReference("https://greenhouse.io.evil.com/acme"), null);
});
