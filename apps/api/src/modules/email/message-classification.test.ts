import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyByRules, groundClassification, maskForModel } from "./message-classification.js";

// --- Masking before anything goes to a model.

test("email addresses, phone numbers and links are masked", () => {
  const masked = maskForModel(
    "Write to jane.doe@acme.io or call +1 (415) 555-0134 / 11 98765-4321. Book at https://cal.acme.io/jane?x=1 or www.acme.io/careers.",
  );
  assert.equal(masked, "Write to [email] or call [phone] / [phone]. Book at [link] or [link].");
});

test("dates, times, years and short numbers are not taken for phone numbers", () => {
  const text = "Interview on 2026-10-21 at 14:30, 45 minutes, for the 2027 team of 12.";
  assert.equal(maskForModel(text), text);
});

// --- Rules for the ATS templates, before any model call.

test("an application confirmation is APPLICATION_RECEIVED, quoting the sentence", () => {
  const result = classifyByRules({ subject: "Thank you for applying to Acme", body: "Hi,\nWe have received your application for Senior Engineer. We will be in touch." });
  assert.equal(result?.classification, "APPLICATION_RECEIVED");
  assert.equal(result?.evidence, "Thank you for applying to Acme");
});

test("a rejection is REJECTION even when it also thanks you for applying", () => {
  const result = classifyByRules({
    subject: "Your application to Acme",
    body: "Thank you for applying. After careful consideration, we have decided to move forward with other candidates.",
  });
  assert.equal(result?.classification, "REJECTION");
  assert.equal(result?.evidence, "we have decided to move forward with other candidates");
});

test("common rejection phrasings are recognised", () => {
  for (const body of [
    "Unfortunately, we will not be moving forward with your application.",
    "We regret to inform you that we won't be proceeding with your candidacy.",
    "The position has been filled.",
    "We have decided not to move forward at this time.",
    "Unfortunately we are unable to offer you a position.",
  ]) {
    assert.equal(classifyByRules({ subject: "", body })?.classification, "REJECTION", body);
  }
});

test("a message that moves forward is not a rule rejection, and rules leave the rest to the model", () => {
  assert.equal(classifyByRules({ subject: "Next steps", body: "We'd love to move forward with you and schedule an interview." }), null);
  assert.equal(classifyByRules({ subject: "Coding challenge", body: "Please complete the attached assessment." }), null);
  assert.equal(classifyByRules({ subject: "", body: "Unfortunately the call link changed; here is the new one." }), null, "'unfortunately' alone is not a rejection");
});

// --- The model's answer is kept only when its quote is in the message.

const text = "Subject: Next steps\n\nHi! We would like to schedule a 30 minute interview next week. Please pick a time at [link].";

test("a class backed by a quote from the message is kept", () => {
  const result = groundClassification({ classification: "INTERVIEW_REQUEST", evidence: "We would like to schedule a 30 minute interview" }, text);
  assert.deepEqual(result, { classification: "INTERVIEW_REQUEST", evidence: "We would like to schedule a 30 minute interview" });
});

test("a quote is matched ignoring case, spacing and curly quotes", () => {
  const result = groundClassification({ classification: "INTERVIEW_REQUEST", evidence: "we would like to  schedule a 30 MINUTE interview." }, text);
  assert.equal(result.classification, "INTERVIEW_REQUEST");
});

test("a quote the message does not contain, or none at all, makes it UNCLEAR", () => {
  assert.deepEqual(groundClassification({ classification: "OFFER", evidence: "we are pleased to offer you the role" }, text), { classification: "UNCLEAR", evidence: "" });
  assert.deepEqual(groundClassification({ classification: "INTERVIEW_REQUEST", evidence: "" }, text), { classification: "UNCLEAR", evidence: "" });
  assert.deepEqual(groundClassification({ classification: "INTERVIEW_REQUEST", evidence: "Hi!" }, text), { classification: "UNCLEAR", evidence: "" }, "too short to prove anything");
});

test("UNCLEAR stays UNCLEAR, and OTHER still needs its quote", () => {
  assert.deepEqual(groundClassification({ classification: "UNCLEAR", evidence: "anything" }, text), { classification: "UNCLEAR", evidence: "" });
  assert.equal(groundClassification({ classification: "OTHER", evidence: "Please pick a time" }, text).classification, "OTHER");
});

test("a thank-you that also asks for an interview, an assessment or a call is left to the model", () => {
  for (const body of [
    "Thank you for applying! We'd like to schedule an interview.",
    "Thanks for applying. Please complete the coding assessment below.",
    "We have received your application and would love to set up a call.",
  ]) {
    assert.equal(classifyByRules({ subject: "", body }), null, body);
  }
});
