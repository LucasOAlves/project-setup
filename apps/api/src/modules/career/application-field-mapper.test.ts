import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApplicationAnswerPublic, ApplicationDetailsPublic, FormField } from "@studio/shared";
import { mapFormFields, questionKey, type FieldMapperInput } from "./application-field-mapper.js";

const CV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LETTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const details: ApplicationDetailsPublic = {
  contact: {
    email: "ada@example.com",
    phone: "+55 11 99999-0000",
    city: "Florianópolis",
    country: "Brazil",
    linkedinUrl: "https://linkedin.com/in/ada",
    githubUrl: "https://github.com/ada",
    portfolioUrl: "",
  },
  education: [],
  certifications: [],
  spokenLanguages: [{ language: "English", level: "FLUENT" }],
  workAuthorization: "Brazilian citizen, works as a contractor",
  requiresVisaSponsorship: false,
  noticePeriod: "30 days",
  timeZone: "UTC-3",
  salaryExpectation: { amount: 96000, currency: "USD", period: "YEAR" },
  version: 3,
  updatedAt: "2026-10-14T12:00:00.000Z",
};

const answers: ApplicationAnswerPublic[] = [
  { id: "YEARS_OF_EXPERIENCE", question: "How many years of professional experience do you have?", answer: "10", status: "FROM_PROFILE" },
  { id: "ENGLISH_LEVEL", question: "What is your English level?", answer: "Fluent", status: "FROM_PROFILE" },
  { id: "WHY_COMPANY", question: "Why do you want to work here?", answer: "I have built payment APIs in Node.js.", status: "DRAFTED" },
];

function field(label: string, overrides: Partial<FormField> = {}): FormField {
  return { key: `k-${label}`, label, kind: "TEXT", required: false, options: [], name: "", ...overrides };
}

function input(fields: FormField[], overrides: Partial<FieldMapperInput> = {}): FieldMapperInput {
  return {
    fields,
    person: { fullName: "Ada Lovelace Byron", currentCompany: "Analytical Engines" },
    details,
    answers,
    experiences: [
      { startPeriod: "2016", endPeriod: "2020", technologies: ["Node.js", "PostgreSQL"] },
      { startPeriod: "2020", endPeriod: "Present", technologies: ["Node.js", "TypeScript"] },
    ],
    documents: { cv: { id: CV, hasFile: true }, coverLetter: null },
    saved: {},
    now: new Date("2026-10-14T12:00:00Z"),
    ...overrides,
  };
}

function one(form: FormField, overrides: Partial<FieldMapperInput> = {}) {
  const [plan] = mapFormFields(input([form], overrides));
  assert.ok(plan);
  return plan;
}

test("question keys ignore case, punctuation, required markers and spacing", () => {
  assert.equal(questionKey("Are you legally authorized to work in Brazil?"), "are you legally authorized to work in brazil");
  assert.equal(questionKey("  ARE you legally authorized, to work in Brazil "), "are you legally authorized to work in brazil");
});

test("names come from the profile's full name", () => {
  assert.equal(one(field("First Name", { required: true })).value, "Ada");
  assert.equal(one(field("Last Name", { required: true })).value, "Lovelace Byron");
  assert.equal(one(field("Full name")).value, "Ada Lovelace Byron");
  assert.equal(one(field("Name")).value, "Ada Lovelace Byron");
  assert.equal(one(field("Name")).source, "YOUR_PROFILE");
});

test("contact details and links come from application details", () => {
  assert.equal(one(field("Email", { kind: "EMAIL" })).value, "ada@example.com");
  assert.equal(one(field("Phone Number", { kind: "PHONE" })).value, "+55 11 99999-0000");
  assert.equal(one(field("Location (City)", { kind: "COMBOBOX" })).value, "Florianópolis, Brazil");
  assert.equal(one(field("Where are you located?")).value, "Florianópolis, Brazil");
  assert.equal(one(field("LinkedIn Profile")).value, "https://linkedin.com/in/ada");
  assert.equal(one(field("GitHub URL", { name: "urls[GitHub]" })).value, "https://github.com/ada");
  assert.equal(one(field("Email")).source, "YOUR_DETAILS");
});

test("a field named by the portal is matched even with a vague label", () => {
  assert.equal(one(field("URL", { name: "urls[LinkedIn]" })).value, "https://linkedin.com/in/ada");
  assert.equal(one(field("Current company", { name: "org" })).value, "Analytical Engines");
});

test("an empty detail leaves an optional field empty and asks for a required one", () => {
  const optional = one(field("Portfolio URL"));
  assert.equal(optional.status, "LEFT_EMPTY");
  assert.equal(optional.value, null);
  const required = one(field("Portfolio URL", { required: true }));
  assert.equal(required.status, "NEEDS_INPUT");
});

test("the CV attaches to the resume field; a missing PDF is a question", () => {
  const resume = one(field("Resume/CV", { kind: "FILE", required: true }));
  assert.equal(resume.status, "FILLED");
  assert.equal(resume.documentId, CV);
  assert.equal(resume.source, "CV");

  const noCv = one(field("Resume", { kind: "FILE", required: true }), { documents: { cv: null, coverLetter: null } });
  assert.equal(noCv.status, "NEEDS_INPUT");
  assert.match(noCv.note ?? "", /Generate the CV/);
});

test("the cover letter attaches only when one exists", () => {
  const without = one(field("Cover Letter", { kind: "FILE" }));
  assert.equal(without.status, "LEFT_EMPTY");
  const withLetter = one(field("Cover Letter", { kind: "FILE" }), { documents: { cv: { id: CV, hasFile: true }, coverLetter: { id: LETTER, hasFile: true } } });
  assert.equal(withLetter.documentId, LETTER);
});

test("visa sponsorship is answered from the stated yes or no, in the field's own options", () => {
  const yesNo = one(field("Will you now or in the future require visa sponsorship?", { kind: "YES_NO", options: ["Yes", "No"], required: true }));
  assert.equal(yesNo.value, "No");
  assert.equal(yesNo.status, "FILLED");
  const radio = one(field("Do you require visa sponsorship to work for us?", { kind: "RADIO", options: ["Yes", "No"] }));
  assert.equal(radio.value, "No");
  const unstated = one(field("Do you require sponsorship?", { kind: "YES_NO", options: ["Yes", "No"], required: true }), {
    details: { ...details, requiresVisaSponsorship: null },
  });
  assert.equal(unstated.status, "NEEDS_INPUT");
});

test("work authorization yes/no is never guessed from free text: it asks, quoting what you wrote", () => {
  const plan = one(field("Are you authorized to work in your country of residence?", { kind: "YES_NO", options: ["Yes", "No"], required: true }));
  assert.equal(plan.status, "NEEDS_INPUT");
  assert.match(plan.note ?? "", /Brazilian citizen, works as a contractor/);
  const text = one(field("What is your work authorization status?", { kind: "TEXTAREA", required: true }));
  assert.equal(text.value, "Brazilian citizen, works as a contractor");
});

test("an answer you saved for the same question is reused, before anything else", () => {
  const form = field("Are you authorized to work in your country of residence?", { kind: "YES_NO", options: ["Yes", "No"], required: true });
  const plan = one(form, { saved: { [questionKey(form.label)]: "Yes" } });
  assert.equal(plan.value, "Yes");
  assert.equal(plan.source, "SAVED_ANSWER");
});

test("a saved answer that is not one of the options is a question again", () => {
  const form = field("How did you hear about this job?", { kind: "SELECT", options: ["LinkedIn", "Referral"], required: true });
  const plan = one(form, { saved: { [questionKey(form.label)]: "A friend" } });
  assert.equal(plan.status, "NEEDS_INPUT");
  assert.match(plan.note ?? "", /not one of the options/);
});

test("options match case and spacing loosely", () => {
  const form = field("Which time zone do you work in?", { kind: "SELECT", options: ["UTC-5", "utc -3", "UTC+0"], required: true });
  assert.equal(one(form).value, "utc -3");
});

test("notice period and salary come from details; salary converts to the period the question asks for", () => {
  assert.equal(one(field("What is your notice period?")).value, "30 days");
  assert.equal(one(field("What are your salary expectations (USD per month)?")).value, "USD 8,000 per month");
  assert.equal(one(field("Desired annual salary")).value, "USD 96,000 per year");
  assert.equal(one(field("Salary expectations")).value, "USD 96,000 per year");
});

test("a salary in another currency than the question's is a question", () => {
  const plan = one(field("Expected salary (EUR)", { required: true }));
  assert.equal(plan.status, "NEEDS_INPUT");
  assert.match(plan.note ?? "", /USD/);
});

test("years with a technology are counted from dated experiences", () => {
  assert.equal(one(field("How many years of experience do you have with Node.js?", { required: true })).value, "10");
  assert.equal(one(field("Years of experience with TypeScript")).value, "6");
  const missing = one(field("How many years of experience do you have with Rust?", { required: true }));
  assert.equal(missing.status, "NEEDS_INPUT");
});

test("prepared answers fill their questions, and drafted text says to review it", () => {
  assert.equal(one(field("How many years of professional experience do you have?")).value, "10");
  assert.equal(one(field("What is your English proficiency?")).value, "Fluent");
  const why = one(field("Why do you want to work at Acme Mock?", { kind: "TEXTAREA", required: true }));
  assert.equal(why.value, "I have built payment APIs in Node.js.");
  assert.equal(why.source, "PREPARED_ANSWER");
  assert.match(why.note ?? "", /review/i);
});

test("voluntary self-identification is never filled for you", () => {
  for (const label of ["Gender (voluntary)", "Race/Ethnicity", "Veteran status", "Disability status", "Pronouns"]) {
    const plan = one(field(label, { kind: "SELECT", options: ["Decline to self-identify", "Other"] }));
    assert.equal(plan.status, "LEFT_EMPTY", label);
  }
  assert.equal(one(field("Gender", { kind: "SELECT", options: ["A", "B"], required: true })).status, "NEEDS_INPUT");
});

test("consent boxes are never ticked for you", () => {
  const plan = one(field("I agree to Acme Mock storing my data for this application.", { kind: "CHECKBOX", required: true }));
  assert.equal(plan.status, "NEEDS_INPUT");
  assert.equal(plan.value, null);
});

test("an unknown required question asks; an unknown optional one stays empty", () => {
  assert.equal(one(field("What is your favourite design pattern?", { required: true })).status, "NEEDS_INPUT");
  assert.equal(one(field("Anything else?", { kind: "TEXTAREA" })).status, "LEFT_EMPTY");
});

test("values longer than the field allows are a question, not cut", () => {
  const plan = one(field("Why do you want to work here?", { kind: "TEXTAREA", maxLength: 10, required: true }));
  assert.equal(plan.status, "NEEDS_INPUT");
  assert.match(plan.note ?? "", /10 characters/);
});

test("every field keeps its key, label, kind and question key", () => {
  const plans = mapFormFields(input([field("Email", { kind: "EMAIL", key: "f3" }), field("Phone", { key: "f4" })]));
  assert.deepEqual(
    plans.map((plan) => [plan.key, plan.label, plan.kind, plan.questionKey]),
    [
      ["f3", "Email", "EMAIL", "email"],
      ["f4", "Phone", "TEXT", "phone"],
    ],
  );
});
