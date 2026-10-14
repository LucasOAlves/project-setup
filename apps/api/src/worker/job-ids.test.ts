import assert from "node:assert/strict";
import test from "node:test";
import { discoveryJobId, evaluationJobId } from "./job-ids.ts";

test("discoveryJobId is one id per source per UTC day", () => {
  const morning = discoveryJobId("remoteok", new Date("2026-10-14T01:00:00Z"));
  const evening = discoveryJobId("remoteok", new Date("2026-10-14T23:59:59Z"));
  assert.equal(morning, "discovery.remoteok.2026-10-14");
  assert.equal(morning, evening);
});

test("discoveryJobId differs across days and across sources", () => {
  const day = new Date("2026-10-14T12:00:00Z");
  assert.notEqual(discoveryJobId("remoteok", day), discoveryJobId("remoteok", new Date("2026-10-15T12:00:00Z")));
  assert.notEqual(discoveryJobId("remoteok", day), discoveryJobId("arbeitnow", day));
});

test("discoveryJobId uses the UTC date, not local time", () => {
  assert.equal(
    discoveryJobId("lever", new Date("2026-10-14T23:30:00-03:00")),
    "discovery.lever.2026-10-15",
  );
});

test("evaluationJobId is one id per job per profile version", () => {
  const id = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";
  assert.equal(evaluationJobId(id, 3), `evaluation.${id}.v3`);
  assert.notEqual(evaluationJobId(id, 3), evaluationJobId(id, 4));
});

test("job ids never contain a colon, which BullMQ rejects", () => {
  assert.equal(discoveryJobId("custom:source", new Date("2026-10-14T00:00:00Z")).includes(":"), false);
  assert.equal(evaluationJobId("a:b", 1).includes(":"), false);
});
