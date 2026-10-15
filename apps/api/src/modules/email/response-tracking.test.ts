import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpState, suggestedStatusFor, suggestionFor } from "./response-tracking.js";

// --- Which pursuit status a message suggests.

test("each class suggests its pursuit status, and the rest suggest nothing", () => {
  assert.equal(suggestedStatusFor("APPLICATION_RECEIVED"), "APPLIED");
  assert.equal(suggestedStatusFor("REJECTION"), "REJECTED");
  assert.equal(suggestedStatusFor("ASSESSMENT"), "SCREENING");
  assert.equal(suggestedStatusFor("INTERVIEW_REQUEST"), "INTERVIEW");
  assert.equal(suggestedStatusFor("OFFER"), "OFFER");
  for (const none of ["RECRUITER_OUTREACH", "OTHER", "UNCLEAR", ""]) assert.equal(suggestedStatusFor(none), "", none);
});

test("a suggestion moves the job forward, never back", () => {
  assert.equal(suggestionFor("INTERVIEW_REQUEST", "APPLIED"), "INTERVIEW");
  assert.equal(suggestionFor("OFFER", "FINAL_INTERVIEW"), "OFFER");
  assert.equal(suggestionFor("APPLICATION_RECEIVED", "INTERVIEW"), "", "a late confirmation does not pull an interview back");
  assert.equal(suggestionFor("ASSESSMENT", "TECHNICAL_INTERVIEW"), "");
  assert.equal(suggestionFor("INTERVIEW_REQUEST", "INTERVIEW"), "", "already there");
});

test("a confirmation of an application already marked APPLIED suggests nothing", () => {
  assert.equal(suggestionFor("APPLICATION_RECEIVED", "APPLIED"), "");
  assert.equal(suggestionFor("APPLICATION_RECEIVED", "PREPARING"), "APPLIED");
});

test("a rejection can come at any open stage, and a closed job gets no suggestion", () => {
  assert.equal(suggestionFor("REJECTION", "FINAL_INTERVIEW"), "REJECTED");
  assert.equal(suggestionFor("REJECTION", "REJECTED"), "");
  assert.equal(suggestionFor("INTERVIEW_REQUEST", "REJECTED"), "");
  assert.equal(suggestionFor("OFFER", "WITHDRAWN"), "");
});

// --- When to consider following up.

const DAY = 24 * 60 * 60 * 1000;
const submittedAt = new Date("2026-10-01T12:00:00Z");
const at = (days: number) => new Date(submittedAt.getTime() + days * DAY);

test("no reply ten days after applying makes a follow-up due", () => {
  assert.deepEqual(followUpState({ submittedAt, jobStatus: "APPLIED", messages: [], now: at(10), afterDays: 10 }), { due: true, waitingDays: 10 });
  assert.deepEqual(followUpState({ submittedAt, jobStatus: "APPLIED", messages: [], now: at(9.9), afterDays: 10 }), { due: false, waitingDays: 9 });
});

test("an automatic confirmation is not a reply, anything else is", () => {
  const confirmation = [{ classification: "APPLICATION_RECEIVED" }];
  assert.equal(followUpState({ submittedAt, jobStatus: "APPLIED", messages: confirmation, now: at(12), afterDays: 10 }).due, true);
  for (const classification of ["INTERVIEW_REQUEST", "REJECTION", "OTHER", "UNCLEAR"]) {
    assert.equal(followUpState({ submittedAt, jobStatus: "APPLIED", messages: [{ classification }], now: at(12), afterDays: 10 }).due, false, classification);
  }
});

test("a job the user moved on, or closed, needs no follow-up", () => {
  for (const jobStatus of ["SCREENING", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"]) {
    assert.equal(followUpState({ submittedAt, jobStatus, messages: [], now: at(30), afterDays: 10 }).due, false, jobStatus);
  }
});

test("the waiting time follows the setting", () => {
  assert.equal(followUpState({ submittedAt, jobStatus: "APPLIED", messages: [], now: at(5), afterDays: 5 }).due, true);
});
