import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MATCH_PREFERENCES,
  DEFAULT_MATCH_WEIGHTS,
  detectTechnologies,
  matchJob,
  validateWeights,
  type MatchJob,
  type MatchProfile,
} from "./job-matching.ts";

const NOW = new Date("2026-10-14T12:00:00Z");

function job(overrides: Partial<MatchJob> = {}): MatchJob {
  return {
    title: "Senior Fullstack Engineer",
    description:
      "We build our platform with TypeScript, Node.js and Angular on PostgreSQL. " +
      "You have 5+ years of experience shipping production systems.",
    seniority: "",
    technologies: [],
    requirements: [],
    preferredQualifications: [],
    employmentType: "FULL_TIME",
    salary: { usdMonthlyMin: 8000, usdMonthlyMax: 10000, approximate: false },
    postedAt: new Date("2026-10-10T00:00:00Z"),
    ...overrides,
  };
}

function profile(overrides: Partial<MatchProfile> = {}): MatchProfile {
  return {
    topSkills: ["TypeScript", "Node"],
    technologies: ["Angular", "PostgreSQL"],
    yearsOfExperience: 10,
    architectureExperience: "",
    leadershipExperience: "",
    experiences: [
      {
        role: "Senior Software Engineer",
        description: "Built TypeScript services on Node.js.",
        responsibilities: "",
        achievements: "Cut p95 latency by 40%.",
        measurableOutcomes: "",
        technologies: ["Angular", "PostgreSQL"],
      },
    ],
    ...overrides,
  };
}

function run(jobOverrides: Partial<MatchJob> = {}, profileOverrides: Partial<MatchProfile> = {}, eligibility: "ELIGIBLE" | "UNKNOWN" | "EXCLUDED" = "ELIGIBLE") {
  return matchJob({ job: job(jobOverrides), profile: profile(profileOverrides), eligibility, now: NOW });
}

// --- technology detection ---------------------------------------------------------------

test("detectTechnologies finds canonical names and respects word boundaries", () => {
  assert.deepEqual(
    detectTechnologies("Our stack: JavaScript, nodejs, Golang, C# and Spring Boot."),
    ["JavaScript", "Node.js", "Go", "C#", "Spring Boot"],
  );
});

test("detectTechnologies does not read Java out of JavaScript or Go out of good", () => {
  const found = detectTechnologies("Good JavaScript skills, going fast.");
  assert.ok(!found.includes("Java"));
  assert.ok(!found.includes("Go"));
  assert.deepEqual(found, ["JavaScript"]);
});

test("detectTechnologies returns each technology once, in order of first mention", () => {
  assert.deepEqual(detectTechnologies("Postgres and React, more React, then PostgreSQL"), [
    "PostgreSQL",
    "React",
  ]);
});

// --- weights ----------------------------------------------------------------------------

test("default weights are the spec's six hypotheses and sum to 1", () => {
  assert.deepEqual(DEFAULT_MATCH_WEIGHTS, {
    technical: 0.3,
    seniority: 0.2,
    experience: 0.2,
    geography: 0.15,
    compensation: 0.1,
    preferences: 0.05,
  });
  assert.doesNotThrow(() => validateWeights(DEFAULT_MATCH_WEIGHTS));
});

test("validateWeights rejects weights that do not sum to 1 or are negative", () => {
  assert.throws(() => validateWeights({ ...DEFAULT_MATCH_WEIGHTS, technical: 0.5 }), /sum to 1/);
  assert.throws(
    () => validateWeights({ ...DEFAULT_MATCH_WEIGHTS, technical: 0.4, preferences: -0.05 }),
    /negative/,
  );
});

test("the overall score is the weighted sum of the dimension scores", () => {
  const result = run();
  const expected = Math.round(
    Object.entries(result.dimensions).reduce((sum, [, d]) => sum + d.weight * d.score, 0),
  );
  assert.equal(result.score, expected);
});

test("custom weights change the overall score", () => {
  const base = run({ salary: null });
  const compensationHeavy = matchJob({
    job: job({ salary: null }),
    profile: profile(),
    eligibility: "ELIGIBLE",
    now: NOW,
    weights: { technical: 0.1, seniority: 0.1, experience: 0.1, geography: 0.1, compensation: 0.55, preferences: 0.05 },
  });
  assert.ok(compensationHeavy.score < base.score);
});

// --- a strong match ---------------------------------------------------------------------

test("a well-matched, eligible, well-paid senior role scores high with full confidence", () => {
  const result = run();
  assert.ok(result.score >= 85, `score ${result.score}`);
  assert.equal(result.confidence, 100);
  assert.deepEqual(result.flags, []);
  assert.deepEqual(result.matchedSkills, ["TypeScript", "Node.js", "Angular", "PostgreSQL"]);
  assert.deepEqual(result.missingSkills, []);
});

test("matching is deterministic and every score is an integer between 0 and 100", () => {
  const first = run();
  assert.deepEqual(run(), first);
  for (const dimension of Object.values(first.dimensions)) {
    assert.ok(Number.isInteger(dimension.score) && dimension.score >= 0 && dimension.score <= 100);
  }
});

// --- technical stack (30%) --------------------------------------------------------------

test("technical score is the share of the job's stack the profile covers", () => {
  const result = run({ description: "TypeScript, Kotlin, Kubernetes and Rust." });
  assert.deepEqual(result.matchedSkills, ["TypeScript"]);
  assert.deepEqual(result.missingSkills, ["Kotlin", "Kubernetes", "Rust"]);
  assert.equal(result.dimensions.technical.score, 25);
});

test("technologies the user typed on the job count alongside those found in the text", () => {
  const result = run({ description: "TypeScript services.", technologies: ["Terraform"] });
  assert.deepEqual(result.matchedSkills, ["TypeScript"]);
  assert.deepEqual(result.missingSkills, ["Terraform"]);
});

test("a profile skill named Java does not cover a job asking for JavaScript", () => {
  const result = run(
    { description: "Strong JavaScript required." },
    { topSkills: ["Java"], technologies: [], experiences: [] },
  );
  assert.deepEqual(result.missingSkills, ["JavaScript"]);
  assert.equal(result.dimensions.technical.score, 0);
});

test("a posting that names no technology leaves the stack unknown, not zero", () => {
  const result = run({ description: "Join our friendly team and build great products." });
  assert.equal(result.dimensions.technical.known, false);
  assert.equal(result.dimensions.technical.score, 50);
  assert.ok(result.flags.includes("STACK_UNKNOWN"));
});

// --- seniority and responsibilities (20%) -----------------------------------------------

test("a staff role for a candidate with three years scores low on seniority", () => {
  const strong = run({ title: "Staff Engineer" }, { yearsOfExperience: 10 });
  const junior = run({ title: "Staff Engineer" }, { yearsOfExperience: 3 });
  assert.ok(junior.dimensions.seniority.score < strong.dimensions.seniority.score);
  assert.ok(junior.dimensions.seniority.score <= 60);
});

test("a title with no seniority level marks seniority unknown", () => {
  const result = run({ title: "Software Engineer" });
  assert.equal(result.dimensions.seniority.known, false);
  assert.ok(result.flags.includes("SENIORITY_UNKNOWN"));
});

test("leadership asked for without leadership evidence lowers seniority and says why", () => {
  const withEvidence = run(
    { title: "Senior Engineer", description: "TypeScript. You will mentor engineers and lead the team." },
    { leadershipExperience: "Led a team of six engineers." },
  );
  const without = run({
    title: "Senior Engineer",
    description: "TypeScript. You will mentor engineers and lead the team.",
  });
  assert.ok(without.dimensions.seniority.score < withEvidence.dimensions.seniority.score);
  assert.ok(without.dimensions.seniority.notes.some((note) => /leadership/i.test(note)));
});

// --- experience and achievements (20%) --------------------------------------------------

test("fewer years than the posting asks for lowers the experience score", () => {
  const enough = run({}, { yearsOfExperience: 10 });
  const short = run({}, { yearsOfExperience: 3 });
  assert.ok(short.dimensions.experience.score < enough.dimensions.experience.score);
  assert.ok(short.dimensions.experience.notes.some((note) => /5\+ years/.test(note)));
});

test("skills listed on the profile but never used in an experience count less", () => {
  const used = run();
  const listedOnly = run(
    {},
    {
      experiences: [
        {
          role: "Engineer",
          description: "Worked on internal tools.",
          responsibilities: "",
          achievements: "",
          measurableOutcomes: "",
          technologies: [],
        },
      ],
    },
  );
  assert.ok(listedOnly.dimensions.experience.score < used.dimensions.experience.score);
});

// --- geographic and contract fit (15%) --------------------------------------------------

test("unknown eligibility scores half on geography and lowers confidence", () => {
  const result = run({}, {}, "UNKNOWN");
  assert.equal(result.dimensions.geography.known, false);
  assert.equal(result.dimensions.geography.score, 50);
  assert.ok(result.flags.includes("ELIGIBILITY_UNKNOWN"));
  assert.equal(result.confidence, 85);
});

test("unknown eligibility with an EOR or contractor signal scores higher but stays unknown", () => {
  const plain = run({}, {}, "UNKNOWN");
  const supported = matchJob({ job: job(), profile: profile(), eligibility: "UNKNOWN", eligibilitySupported: true, now: NOW });
  assert.equal(supported.dimensions.geography.score, 65);
  assert.equal(supported.dimensions.geography.known, false);
  assert.ok(supported.flags.includes("ELIGIBILITY_UNKNOWN"));
  assert.equal(supported.confidence, plain.confidence);
  assert.ok(supported.dimensions.geography.notes.some((note) => /EOR|contractor/i.test(note)));
});

test("the EOR signal does not change a confirmed or excluded geography score", () => {
  const eligible = matchJob({ job: job(), profile: profile(), eligibility: "ELIGIBLE", eligibilitySupported: true, now: NOW });
  assert.equal(eligible.dimensions.geography.score, 100);
  const excluded = matchJob({ job: job(), profile: profile(), eligibility: "EXCLUDED", eligibilitySupported: true, now: NOW });
  assert.equal(excluded.dimensions.geography.score, 0);
});

test("an internship scores lower on contract fit than a full-time role", () => {
  const fullTime = run();
  const internship = run({ employmentType: "INTERNSHIP" });
  assert.ok(internship.dimensions.geography.score < fullTime.dimensions.geography.score);
});

test("an excluded job scores zero on geography", () => {
  assert.equal(run({}, {}, "EXCLUDED").dimensions.geography.score, 0);
});

// --- compensation (10%) -----------------------------------------------------------------

test("undisclosed compensation is an uncertainty, not an exclusion", () => {
  const result = run({ salary: null });
  assert.equal(result.dimensions.compensation.known, false);
  assert.equal(result.dimensions.compensation.score, 50);
  assert.ok(result.flags.includes("COMPENSATION_UNDISCLOSED"));
  assert.equal(result.confidence, 90);
  assert.ok(result.score > 70);
});

test("pay below the target scales the compensation score and is flagged", () => {
  const result = run({ salary: { usdMonthlyMin: 4000, usdMonthlyMax: 4500, approximate: false } });
  assert.equal(result.dimensions.compensation.score, 75);
  assert.ok(result.flags.includes("COMPENSATION_BELOW_TARGET"));
});

test("a range whose top reaches the target scores full compensation", () => {
  const result = run({ salary: { usdMonthlyMin: 5000, usdMonthlyMax: 7000, approximate: false } });
  assert.equal(result.dimensions.compensation.score, 100);
});

test("a converted salary is flagged approximate but still counts as known", () => {
  const result = run({ salary: { usdMonthlyMin: 7000, usdMonthlyMax: 9000, approximate: true } });
  assert.equal(result.dimensions.compensation.known, true);
  assert.ok(result.flags.includes("COMPENSATION_APPROXIMATE"));
});

test("the compensation target comes from preferences", () => {
  const result = matchJob({
    job: job({ salary: { usdMonthlyMin: 8000, usdMonthlyMax: 8000, approximate: false } }),
    profile: profile(),
    eligibility: "ELIGIBLE",
    now: NOW,
    preferences: { ...DEFAULT_MATCH_PREFERENCES, targetUsdMonthly: 10000 },
  });
  assert.equal(result.dimensions.compensation.score, 80);
});

// --- other preferences (5%) -------------------------------------------------------------

test("an old posting and an off-target title lower the preferences score", () => {
  const fresh = run();
  const stale = run({ title: "Software Engineer", postedAt: new Date("2026-07-01T00:00:00Z") });
  assert.ok(stale.dimensions.preferences.score < fresh.dimensions.preferences.score);
});
