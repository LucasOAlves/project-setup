import assert from "node:assert/strict";
import test from "node:test";
import { applicationPrepJobId, discoveryJobId, emailCheckJobId, evaluationJobId, watchJobId } from "./job-ids.ts";

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

test("watchJobId is one id per company per UTC hour", () => {
  const id = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";
  assert.equal(watchJobId(id, new Date("2026-10-14T12:05:00Z")), `watch.${id}.2026-10-14T12`);
  assert.equal(watchJobId(id, new Date("2026-10-14T12:59:00Z")), watchJobId(id, new Date("2026-10-14T12:01:00Z")));
  assert.notEqual(watchJobId(id, new Date("2026-10-14T13:00:00Z")), watchJobId(id, new Date("2026-10-14T12:59:00Z")));
  assert.equal(watchJobId(id, new Date("2026-10-14T12:05:00Z")).includes(":"), false);
});

test("applicationPrepJobId is one id per application per run, with no colons", () => {
  const id = applicationPrepJobId("app-1", "2026-10-14T12:00:00.000Z");
  assert.equal(id, applicationPrepJobId("app-1", "2026-10-14T12:00:00.000Z"));
  assert.notEqual(id, applicationPrepJobId("app-1", "2026-10-14T12:05:00.000Z"));
  assert.equal(id.includes(":"), false);
});

test("applicationSubmitJobId is one id per approval, with no colons", async () => {
  const { applicationSubmitJobId } = await import("./job-ids.ts");
  const id = applicationSubmitJobId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(id, applicationSubmitJobId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
  assert.notEqual(id, applicationSubmitJobId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
  assert.doesNotMatch(id, /:/);
});

test("emailCheckJobId is one id per UTC minute, with no colon (BullMQ refuses one)", () => {
  const id = emailCheckJobId(new Date("2026-10-15T11:05:59Z"));
  assert.equal(id, "email-check.2026-10-15T11-05");
  assert.equal(id, emailCheckJobId(new Date("2026-10-15T11:05:00Z")));
  assert.ok(!id.includes(":"));
});
