import assert from "node:assert/strict";
import test from "node:test";
import { BRAZIL_REMOTE_CANDIDATE, evaluateEligibility } from "./job-eligibility.ts";

function check(job: { title?: string; location?: string; description?: string }) {
  return evaluateEligibility(
    { title: job.title ?? "Senior Software Engineer", location: job.location ?? "", description: job.description ?? "" },
    BRAZIL_REMOTE_CANDIDATE,
  );
}

// --- Confirmed exclusions -----------------------------------------------------------------

test("a US-only location is excluded, quoting the location", () => {
  const result = check({ location: "USA Only" });
  assert.equal(result.status, "EXCLUDED");
  assert.deepEqual(result.reasons[0], {
    rule: "REGION_RESTRICTED",
    effect: "EXCLUDES",
    field: "location",
    quote: "USA Only",
  });
});

test("a location limited to regions outside the candidate's reach is excluded", () => {
  assert.equal(check({ location: "Europe" }).status, "EXCLUDED");
  assert.equal(check({ location: "United Kingdom, EMEA" }).status, "EXCLUDED");
  assert.equal(check({ location: "Canada" }).status, "EXCLUDED");
});

test("US residency wording in the description excludes, quoting that sentence", () => {
  const result = check({
    location: "Remote",
    description: "We build payments. You must be based in the United States. We offer equity.",
  });
  assert.equal(result.status, "EXCLUDED");
  const reason = result.reasons.find((r) => r.rule === "US_RESIDENCY");
  assert.equal(reason?.field, "description");
  assert.equal(reason?.quote, "You must be based in the United States.");
});

test("US work authorization, citizenship and clearance requirements exclude", () => {
  for (const text of [
    "Candidates must be authorized to work in the US without sponsorship.",
    "US citizenship is required for this role.",
    "An active security clearance is required.",
    "Applicants must hold a green card.",
  ]) {
    assert.equal(check({ location: "Remote", description: text }).status, "EXCLUDED", text);
  }
});

test("work authorization in another country the candidate lacks excludes", () => {
  const result = check({ location: "Remote", description: "You must have the right to work in the UK." });
  assert.equal(result.status, "EXCLUDED");
  assert.equal(result.reasons[0]?.rule, "WORK_AUTHORIZATION");
});

test("a 'US only' marker in the title excludes", () => {
  assert.equal(check({ title: "Backend Engineer (US Only)", location: "Remote" }).status, "EXCLUDED");
});

test("an on-site or hybrid role abroad is excluded", () => {
  assert.equal(check({ location: "Hybrid - Berlin" }).status, "EXCLUDED");
  assert.equal(check({ location: "On-site, New York" }).status, "EXCLUDED");
  assert.equal(
    check({ location: "London", description: "This role is hybrid, 3 days a week in the office." }).status,
    "EXCLUDED",
  );
});

// --- Confirmed eligibility ----------------------------------------------------------------

test("worldwide, LATAM, Americas or Brazil locations confirm eligibility", () => {
  for (const location of ["Worldwide", "LATAM", "Americas", "Brazil", "Remote - Anywhere"]) {
    const result = check({ location });
    assert.equal(result.status, "ELIGIBLE", location);
    assert.equal(result.reasons[0]?.effect, "CONFIRMS");
  }
});

test("a mixed list that includes an accepted region is eligible", () => {
  assert.equal(check({ location: "USA, Canada, Brazil" }).status, "ELIGIBLE");
});

test("description wording can confirm eligibility when the location is vague", () => {
  const result = check({
    location: "Remote",
    description: "Great team. We hire candidates from anywhere in the world. Async-first.",
  });
  assert.equal(result.status, "ELIGIBLE");
  assert.equal(result.reasons[0]?.quote, "We hire candidates from anywhere in the world.");
});

test("an on-site role in Brazil is not excluded as abroad", () => {
  assert.equal(check({ location: "On-site, São Paulo, Brazil" }).status, "ELIGIBLE");
});

// --- Unknown ------------------------------------------------------------------------------

test("a bare 'Remote' with nothing else is unknown, never eligible", () => {
  const result = check({ location: "Remote", description: "Build great things with TypeScript." });
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.reasons, []);
});

test("an empty job is unknown", () => {
  assert.equal(check({}).status, "UNKNOWN");
});

// --- Precedence and false positives -------------------------------------------------------

test("an explicit exclusion wins over an accepted region", () => {
  const result = check({
    location: "Worldwide",
    description: "Applicants must be authorized to work in the United States.",
  });
  assert.equal(result.status, "EXCLUDED");
  assert.ok(result.reasons.some((r) => r.effect === "CONFIRMS"));
  assert.ok(result.reasons.some((r) => r.effect === "EXCLUDES"));
});

test("mentions of the US that are not restrictions do not exclude", () => {
  for (const text of [
    "Our customers are mostly in the United States.",
    "Join us and help us grow.",
    "We have offices in the US and Europe, but this role is remote worldwide.",
    "Occasional onsite meetups twice a year.",
  ]) {
    assert.notEqual(check({ location: "Remote", description: text }).status, "EXCLUDED", text);
  }
});

test("quotes are capped at 300 characters", () => {
  const long = `You must be located in the United States ${"and more ".repeat(60)}.`;
  const reason = check({ location: "Remote", description: long }).reasons[0];
  assert.ok((reason?.quote.length ?? 0) <= 300);
});

test("work authorization in the candidate's own country does not exclude", () => {
  assert.notEqual(
    check({ location: "Remote", description: "You must be authorized to work in Brazil." }).status,
    "EXCLUDED",
  );
});

test("an on-site role at home stays eligible even when the description says on-site", () => {
  const result = check({ location: "São Paulo, Brazil", description: "This role is on-site in our São Paulo office." });
  assert.equal(result.status, "ELIGIBLE");
});
