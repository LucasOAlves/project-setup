import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationPageUrl, cleanLabel, normalizeFormControls, type RawControl } from "./form-fields.js";

function control(overrides: Partial<RawControl>): RawControl {
  return {
    key: "f1",
    tag: "input",
    type: "text",
    role: "",
    name: "",
    label: "",
    optionLabel: "",
    required: false,
    options: [],
    visible: true,
    ...overrides,
  };
}

test("application page URLs per portal", () => {
  assert.equal(applicationPageUrl("greenhouse", "https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x#app"), "https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x");
  assert.equal(applicationPageUrl("lever", "https://jobs.lever.co/acme/1a2b-3c"), "https://jobs.lever.co/acme/1a2b-3c/apply");
  assert.equal(applicationPageUrl("lever", "https://jobs.lever.co/acme/1a2b-3c/apply"), "https://jobs.lever.co/acme/1a2b-3c/apply");
  assert.equal(applicationPageUrl("ashby", "https://jobs.ashbyhq.com/acme/9f8e"), "https://jobs.ashbyhq.com/acme/9f8e/application");
  assert.equal(applicationPageUrl("ashby", "https://jobs.ashbyhq.com/acme/9f8e/application?src=x"), "https://jobs.ashbyhq.com/acme/9f8e/application?src=x");
});

test("a board page without a posting has no application page", () => {
  assert.equal(applicationPageUrl("lever", "https://jobs.lever.co/acme"), null);
  assert.equal(applicationPageUrl("ashby", "https://jobs.ashbyhq.com/acme"), null);
  assert.equal(applicationPageUrl("greenhouse", "https://job-boards.greenhouse.io/acme"), null);
  assert.equal(applicationPageUrl("greenhouse", "not a url"), null);
});

test("labels lose their required markers, which set required", () => {
  assert.deepEqual(cleanLabel("  First   Name *"), { label: "First Name", marked: true });
  assert.deepEqual(cleanLabel("Full name✱"), { label: "Full name", marked: true });
  assert.deepEqual(cleanLabel("LinkedIn Profile (required)"), { label: "LinkedIn Profile", marked: true });
  assert.deepEqual(cleanLabel("Cover letter (optional)"), { label: "Cover letter", marked: false });
  assert.equal(cleanLabel("x".repeat(500)).label.length, 300);
});

test("inputs map to kinds by type and role", () => {
  const fields = normalizeFormControls([
    control({ key: "a", type: "email", label: "Email*" }),
    control({ key: "b", type: "tel", label: "Phone" }),
    control({ key: "c", type: "url", label: "Website" }),
    control({ key: "d", type: "text", role: "combobox", label: "Location (City)" }),
    control({ key: "e", tag: "textarea", type: "", label: "Why us?", required: true }),
    control({ key: "f", type: "file", label: "Resume/CV", visible: false, accept: ".pdf,.doc" }),
    control({ key: "g", type: "number", label: "Years" }),
  ]);
  assert.deepEqual(
    fields.map((field) => [field.key, field.kind, field.label, field.required]),
    [
      ["a", "EMAIL", "Email", true],
      ["b", "PHONE", "Phone", false],
      ["c", "URL", "Website", false],
      ["d", "COMBOBOX", "Location (City)", false],
      ["e", "TEXTAREA", "Why us?", true],
      ["f", "FILE", "Resume/CV", false],
      ["g", "NUMBER", "Years", false],
    ],
  );
  assert.equal(fields[5]?.accept, ".pdf,.doc");
});

test("hidden controls, buttons and honeypots are dropped, but hidden file inputs are kept", () => {
  const fields = normalizeFormControls([
    control({ key: "a", type: "hidden", name: "token" }),
    control({ key: "b", type: "submit", label: "Submit" }),
    control({ key: "c", type: "text", label: "Leave this empty", visible: false }),
    control({ key: "d", type: "file", label: "Resume", visible: false }),
  ]);
  assert.deepEqual(fields.map((field) => field.key), ["d"]);
});

test("radio buttons become one field per group, with each button's label as an option", () => {
  const fields = normalizeFormControls([
    control({ key: "r1", type: "radio", name: "q_auth", label: "Are you authorized to work?*", optionLabel: "Yes" }),
    control({ key: "r2", type: "radio", name: "q_auth", label: "Are you authorized to work?*", optionLabel: "No" }),
  ]);
  assert.equal(fields.length, 1);
  assert.deepEqual(
    { key: fields[0]?.key, kind: fields[0]?.kind, label: fields[0]?.label, required: fields[0]?.required, options: fields[0]?.options, name: fields[0]?.name },
    { key: "r1", kind: "RADIO", label: "Are you authorized to work?", required: true, options: ["Yes", "No"], name: "q_auth" },
  );
});

test("a lone checkbox is a consent box; several with one name are a multi-choice", () => {
  const fields = normalizeFormControls([
    control({ key: "c0", type: "checkbox", name: "consent", label: "", optionLabel: "I agree to the privacy policy", required: true }),
    control({ key: "c1", type: "checkbox", name: "langs", label: "Languages", optionLabel: "English" }),
    control({ key: "c2", type: "checkbox", name: "langs", label: "Languages", optionLabel: "Spanish" }),
  ]);
  assert.deepEqual(
    fields.map((field) => [field.kind, field.label, field.options, field.required]),
    [
      ["CHECKBOX", "I agree to the privacy policy", [], true],
      ["CHECKBOX", "Languages", ["English", "Spanish"], false],
    ],
  );
});

test("select placeholders are not options", () => {
  const [field] = normalizeFormControls([
    control({ key: "s", tag: "select", type: "", label: "Country", options: ["", "Select...", "Please select", "Brazil", "Portugal", "--"] }),
  ]);
  assert.deepEqual(field?.options, ["Brazil", "Portugal"]);
  assert.equal(field?.kind, "SELECT");
});

test("a yes/no button pair is a yes-no field", () => {
  const [field] = normalizeFormControls([
    control({ key: "y", tag: "button-group", type: "", label: "Do you need visa sponsorship?*", options: ["Yes", "No"] }),
  ]);
  assert.equal(field?.kind, "YES_NO");
  assert.deepEqual(field?.options, ["Yes", "No"]);
  assert.equal(field?.required, true);
});

test("a control with no label falls back to its humanized name", () => {
  const [field] = normalizeFormControls([control({ key: "u", type: "text", name: "urls[LinkedIn]", label: "" })]);
  assert.equal(field?.label, "urls LinkedIn");
  assert.equal(field?.name, "urls[LinkedIn]");
});
