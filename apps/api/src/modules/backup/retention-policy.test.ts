import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrunableNotification, retentionCutoffs, retentionPolicy } from "./retention-policy.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-15T04:00:00Z");
const daysAgo = (date: Date) => (now.getTime() - date.getTime()) / DAY;

test("the defaults: screenshots 30 days, message text 180, unmatched Gmail ids 60, notification records 180", () => {
  assert.deepEqual(retentionPolicy({}), { screenshotDays: 30, messageBodyDays: 180, unmatchedMessageDays: 60, notificationDays: 180 });
});

test("each cutoff is that many days before now", () => {
  const cutoffs = retentionCutoffs(retentionPolicy({ screenshotDays: 14, messageBodyDays: 90 }), now);
  assert.equal(daysAgo(cutoffs.screenshotsBefore), 14);
  assert.equal(daysAgo(cutoffs.messageBodiesBefore), 90);
  assert.equal(daysAgo(cutoffs.unmatchedMessagesBefore), 60);
  assert.equal(daysAgo(cutoffs.notificationsBefore), 180);
});

test("unmatched Gmail ids outlive the mail search window, so a message is never read twice", () => {
  // The mailbox check searches the last 30 days and skips ids it already has.
  const policy = retentionPolicy({ mailLookbackDays: 45 });
  assert.ok(policy.unmatchedMessageDays > 45, `got ${policy.unmatchedMessageDays}`);
  assert.equal(retentionPolicy({ mailLookbackDays: 30 }).unmatchedMessageDays, 60);
});

test("a setting below one day, or not a whole number, is refused", () => {
  assert.throws(() => retentionPolicy({ screenshotDays: 0 }), /SCREENSHOT_RETENTION_DAYS/);
  assert.throws(() => retentionPolicy({ messageBodyDays: -5 }), /MESSAGE_BODY_RETENTION_DAYS/);
  assert.throws(() => retentionPolicy({ screenshotDays: 1.5 }), /SCREENSHOT_RETENTION_DAYS/);
});

test("follow-up records are kept, so a follow-up for a job still waiting is never sent again", () => {
  assert.equal(isPrunableNotification("FOLLOW_UP"), false);
  for (const kind of ["APPLICATION", "MESSAGE", "BUDGET", "DIGEST"]) assert.equal(isPrunableNotification(kind), true, kind);
});
