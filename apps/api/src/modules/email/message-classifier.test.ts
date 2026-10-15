import assert from "node:assert/strict";
import { test } from "node:test";
import type { TextGenerationProvider, TextGenerationRequest } from "../ai/text-generation-provider.js";
import { MessageClassifier } from "./message-classifier.js";

function provider(answer: string | Error) {
  const calls: TextGenerationRequest[] = [];
  const text: TextGenerationProvider = {
    async generateText(request) {
      calls.push(request);
      if (answer instanceof Error) throw answer;
      return { text: answer, model: "test-model", usage: { inputTokens: 120, outputTokens: 20 } };
    },
  };
  return { text, calls };
}

const interview = {
  subject: "Next steps at Acme",
  body: "Hi! We would like to schedule a 30 minute interview. Reach me at jane@acme.io or +1 415 555 0134, or book at https://cal.acme.io/jane.",
};

test("an ATS template is classified by rules, without a model call", async () => {
  const fake = provider("{}");
  const result = await new MessageClassifier(fake.text).classify({ subject: "Update", body: "We regret to inform you that the role has closed." });
  assert.equal(result.classification, "REJECTION");
  assert.equal(result.classifiedBy, "RULES");
  assert.equal(fake.calls.length, 0);
});

test("the model sees only the masked subject and body, and its quoted class is kept", async () => {
  const fake = provider(JSON.stringify({ classification: "INTERVIEW_REQUEST", evidence: "We would like to schedule a 30 minute interview" }));
  const result = await new MessageClassifier(fake.text).classify(interview);
  assert.deepEqual(
    [result.classification, result.evidence, result.classifiedBy, result.model, result.inputTokens],
    ["INTERVIEW_REQUEST", "We would like to schedule a 30 minute interview", "recruiter-message.v1", "test-model", 120],
  );
  const sent = fake.calls[0]!.user;
  for (const secret of ["jane@acme.io", "555", "cal.acme.io"]) assert.ok(!sent.includes(secret), secret);
  assert.ok(sent.includes("[email]") && sent.includes("[phone]") && sent.includes("[link]"));
  assert.equal(fake.calls[0]!.purpose, "recruiter-message.v1");
});

test("a class whose quote is not in the message becomes UNCLEAR", async () => {
  const fake = provider(JSON.stringify({ classification: "OFFER", evidence: "we are delighted to offer you the position" }));
  const result = await new MessageClassifier(fake.text).classify(interview);
  assert.deepEqual([result.classification, result.evidence], ["UNCLEAR", ""]);
});

test("a malformed answer, a failed call or no model leaves the message UNCLEAR", async () => {
  for (const answer of ["not json", JSON.stringify({ classification: "HIRED", evidence: "x" }), new Error("down")]) {
    const result = await new MessageClassifier(provider(answer).text).classify(interview);
    assert.equal(result.classification, "UNCLEAR", String(answer));
  }
  const none = await new MessageClassifier(null).classify(interview);
  assert.deepEqual([none.classification, none.classifiedBy], ["UNCLEAR", "NONE"]);
});
