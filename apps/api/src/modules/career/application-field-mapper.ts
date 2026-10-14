import type { ApplicationAnswerPublic, ApplicationDetailsPublic, FieldPlan, FieldPlanSource, FormField } from "@studio/shared";
import { yearsWithTechnology, type AnswerExperience } from "./application-answers.js";
import { detectTechnologies } from "./job-matching.js";

// Decides what goes in each field of a portal's application form (Milestone 3, ticket 4).
// Deterministic: values come only from what the user stated (application details, the profile,
// prepared answers, answers saved for the same question). A required field with no stated value
// becomes a question for the user. Nothing is guessed, and choices the user must make
// themselves (consent, voluntary self-identification) are never made for them. Labels are the
// portal's text, read only as data to match against.

export type FieldMapperInput = {
  fields: FormField[];
  person: { fullName: string; currentCompany: string };
  details: ApplicationDetailsPublic | null;
  // The latest prepared answers for this job (Milestone 2), if any.
  answers: ApplicationAnswerPublic[];
  experiences: AnswerExperience[];
  documents: {
    cv: { id: string; hasFile: boolean } | null;
    coverLetter: { id: string; hasFile: boolean } | null;
  };
  // Answers the user gave before, by questionKey.
  saved: Record<string, string>;
  now: Date;
};

// A null value leaves an optional field empty and asks the user for a required one.
type Resolved = { value: string | null; source: FieldPlanSource | null; note?: string; documentId?: string };

const CHOICE_KINDS = new Set(["SELECT", "RADIO", "YES_NO"]);
const VOLUNTARY = /\b(gender|race|ethnicity|ethnic|veteran|disability|disabled|pronouns?|sexual orientation|lgbt|hispanic|latino)\b/;
const CURRENCIES = /\b(USD|EUR|GBP|BRL|CAD|AUD|CHF)\b|[$€£]/i;
const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };

export function questionKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function loose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]/g, "");
}

function nameParts(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

function stated(value: string | undefined | null, source: FieldPlanSource): Resolved {
  const text = value?.trim() ?? "";
  return text ? { value: text, source } : { value: null, source: null };
}

function salary(details: ApplicationDetailsPublic | null, text: string): Resolved {
  const expectation = details?.salaryExpectation;
  if (!expectation) return { value: null, source: null };
  const currencyMatch = text.match(CURRENCIES)?.[0];
  const asked = currencyMatch ? (SYMBOL_CURRENCY[currencyMatch] ?? currencyMatch.toUpperCase()) : null;
  if (asked && asked !== expectation.currency) {
    return { value: null, source: null, note: `The question asks in ${asked}; your expectation is in ${expectation.currency}.` };
  }
  const period = /\b(month|monthly|mo)\b|\/mo\b/.test(text) ? "MONTH" : /\b(year|yearly|annual|annually|annum|yr)\b/.test(text) ? "YEAR" : expectation.period;
  const amount =
    period === expectation.period ? expectation.amount : period === "MONTH" ? Math.round(expectation.amount / 12) : expectation.amount * 12;
  return {
    value: `${expectation.currency} ${amount.toLocaleString("en-US")} per ${period === "MONTH" ? "month" : "year"}`,
    source: "YOUR_DETAILS",
  };
}

function preparedAnswer(answers: ApplicationAnswerPublic[], id: string): Resolved {
  const answer = answers.find((candidate) => candidate.id === id);
  if (!answer || !answer.answer.trim() || answer.status === "NEEDS_INPUT") return { value: null, source: null };
  return {
    value: answer.answer.trim(),
    source: "PREPARED_ANSWER",
    ...(answer.status === "DRAFTED" ? { note: "Drafted from your profile and the posting. Review it before you approve." } : {}),
  };
}

// The rules, in order. The first that recognizes the question answers it, even with nothing
// (an empty detail), so a later rule never answers a question it was not meant for.
function resolve(form: FormField, input: FieldMapperInput): Resolved | null {
  const { details, person } = input;
  const contact = details?.contact;
  const label = form.label.toLowerCase();
  const name = form.name.toLowerCase();
  const text = `${label} ${name}`;
  const { first, last } = nameParts(person.fullName);

  if (/\b(first|given) name\b|^first_?name$/.test(text) || name === "first_name") return stated(first, "YOUR_PROFILE");
  if (/\b(last|family) name\b|\bsurname\b/.test(text) || name === "last_name") return stated(last, "YOUR_PROFILE");
  if (/\bemail\b|e-mail/.test(text)) return stated(contact?.email, "YOUR_DETAILS");
  if (/\bphone\b|\bmobile\b|telephone/.test(text)) return stated(contact?.phone, "YOUR_DETAILS");
  if (/linkedin/.test(text)) return stated(contact?.linkedinUrl, "YOUR_DETAILS");
  if (/github/.test(text)) return stated(contact?.githubUrl, "YOUR_DETAILS");
  if (/portfolio|personal (site|website)|^website\b|\bwebsite$/.test(label) || /urls\[(portfolio|other)\]/.test(name)) {
    return stated(contact?.portfolioUrl, "YOUR_DETAILS");
  }
  if (/current (company|employer)|^org$/.test(label) || name === "org") return stated(person.currentCompany, "YOUR_PROFILE");
  if (/^(full )?name$|\bfull name\b|\byour name\b|^_systemfield_name$/.test(label) || name === "name" || name === "_systemfield_name") {
    return stated(person.fullName, "YOUR_PROFILE");
  }
  if (/sponsor/.test(text)) {
    const needs = details?.requiresVisaSponsorship;
    return needs === null || needs === undefined ? { value: null, source: null } : { value: needs ? "Yes" : "No", source: "YOUR_DETAILS" };
  }
  if (/authori[sz]|right to work|eligib|work permit|legally (able|allowed)/.test(text)) {
    const statement = details?.workAuthorization.trim() ?? "";
    if (CHOICE_KINDS.has(form.kind) || form.kind === "COMBOBOX" || form.kind === "CHECKBOX") {
      return {
        value: null,
        source: null,
        note: statement
          ? `Answer this one yourself. In your details you wrote: "${statement}".`
          : "Answer this one yourself, and add your work authorization to Application details.",
      };
    }
    return stated(statement, "YOUR_DETAILS");
  }
  if (/notice period|start date|when can you start|availability to start/.test(text)) return stated(details?.noticePeriod, "YOUR_DETAILS");
  if (/time ?zone/.test(text)) return stated(details?.timeZone, "YOUR_DETAILS");
  if (/salary|compensation|pay expectation|expected pay|rate expectation/.test(text)) return salary(details, `${form.label} ${form.name}`);
  if (/\byears?\b.*\bexperience\b|\bexperience\b.*\byears?\b/.test(label)) {
    const subject = label.match(/\b(?:with|in|using)\b\s+(.+)$/)?.[1] ?? "";
    const technology = detectTechnologies(subject)[0];
    if (technology) {
      const result = yearsWithTechnology(input.experiences, technology, input.now);
      if (result.years !== null) return { value: String(result.years), source: "YOUR_PROFILE" };
      return {
        value: null,
        source: null,
        note:
          result.reason === "UNDATED"
            ? `Some experiences with ${technology} have no start or end year.`
            : `None of your experiences lists ${technology} among its technologies.`,
      };
    }
    if (subject && !/professional|work|total|relevant|software|engineering|industry/.test(subject)) {
      return { value: null, source: null, note: "Could not tell which skill this asks about." };
    }
    return preparedAnswer(input.answers, "YEARS_OF_EXPERIENCE");
  }
  if (/\benglish\b/.test(label)) {
    const prepared = preparedAnswer(input.answers, "ENGLISH_LEVEL");
    if (prepared.value) return prepared;
    const english = details?.spokenLanguages.find((language) => /^english$/i.test(language.language));
    return english ? { value: english.level.charAt(0) + english.level.slice(1).toLowerCase(), source: "YOUR_DETAILS" } : { value: null, source: null };
  }
  if (/\bwhy\b.*\b(work|join|interested|apply|applying|want)\b|what (excites|interests) you|motivat/.test(label)) {
    return preparedAnswer(input.answers, "WHY_COMPANY");
  }
  if (/\b(location|city|where are you (located|based)|based in|current location)\b/.test(text)) {
    const place = [contact?.city, contact?.country].map((part) => part?.trim()).filter(Boolean).join(", ");
    return stated(place, "YOUR_DETAILS");
  }
  if (/^country\b|country of residence/.test(label)) return stated(contact?.country, "YOUR_DETAILS");

  // The same question answered in the prepared answers, word for word.
  const key = questionKey(form.label);
  const same = input.answers.find((answer) => questionKey(answer.question) === key);
  if (same) return preparedAnswer(input.answers, same.id);
  return null;
}

function fileField(form: FormField, input: FieldMapperInput): Resolved {
  const text = `${form.label} ${form.name}`.toLowerCase();
  if (/cover/.test(text)) {
    const letter = input.documents.coverLetter;
    return letter?.hasFile ? { value: "Cover letter PDF", source: "COVER_LETTER", documentId: letter.id } : { value: null, source: null, note: "Write a cover letter in Materials to attach one." };
  }
  if (/resume|résumé|\bcv\b|curriculum/.test(text)) {
    const cv = input.documents.cv;
    return cv?.hasFile ? { value: "CV PDF", source: "CV", documentId: cv.id } : { value: null, source: null, note: "Generate the CV in Materials first." };
  }
  return { value: null, source: null, note: "Only your CV and cover letter are ever attached." };
}

function matchOption(options: string[], value: string): string | null {
  const wanted = loose(value);
  return options.find((option) => loose(option) === wanted) ?? null;
}

function plan(form: FormField, resolved: Resolved): FieldPlan {
  const base = {
    key: form.key,
    questionKey: questionKey(form.label),
    label: form.label,
    kind: form.kind,
    required: form.required,
    options: form.options,
  };
  if (resolved.value === null) {
    return {
      ...base,
      status: form.required ? "NEEDS_INPUT" : "LEFT_EMPTY",
      value: null,
      source: null,
      ...(resolved.note ? { note: resolved.note } : {}),
    };
  }

  let value = resolved.value;
  const needs = (note: string): FieldPlan => ({ ...base, status: form.required ? "NEEDS_INPUT" : "LEFT_EMPTY", value: null, source: null, note });

  if (form.kind !== "FILE") {
    if (CHOICE_KINDS.has(form.kind) && form.options.length > 0) {
      const option = matchOption(form.options, value);
      if (!option) return needs(`"${value}" is not one of the options.`);
      value = option;
    }
    if (form.kind === "NUMBER") {
      const number = value.match(/\d+(\.\d+)?/)?.[0];
      if (!number) return needs(`"${value}" is not a number.`);
      value = number;
    }
    if (form.maxLength && value.length > form.maxLength) {
      return needs(`The answer is longer than the ${form.maxLength} characters this field allows.`);
    }
  }
  return {
    ...base,
    status: "FILLED",
    value,
    source: resolved.source,
    ...(resolved.documentId ? { documentId: resolved.documentId } : {}),
    ...(resolved.note ? { note: resolved.note } : {}),
  };
}

export function mapFormFields(input: FieldMapperInput): FieldPlan[] {
  return input.fields.map((form) => {
    const label = form.label.toLowerCase();

    if (form.kind === "CHECKBOX" && form.options.length === 0) {
      return plan(form, { value: null, source: null, note: "Only you can agree to this. Confirm it in the preview if you do." });
    }
    if (VOLUNTARY.test(label)) {
      return plan(form, { value: null, source: null, note: "Voluntary self-identification is left for you." });
    }
    if (form.kind === "FILE") return plan(form, fileField(form, input));

    const saved = input.saved[questionKey(form.label)];
    if (saved?.trim()) return plan(form, { value: saved.trim(), source: "SAVED_ANSWER" });

    return plan(form, resolve(form, input) ?? { value: null, source: null });
  });
}
