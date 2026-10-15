import { quoteAppearsIn } from "../career/job-explanation-grounding.js";
import type { RecruiterMessageClass } from "@studio/shared";

// Classifying recruiter replies (Milestone 5, ticket 4; spec A10). Pure functions: masking
// before a model call, rules for the ATS templates, and the check that a model's class rests
// on a quote from the message. Nothing here infers a status: an unproven class is UNCLEAR.

export type ClassificationResult = { classification: RecruiterMessageClass; evidence: string };

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// A run of digits with phone separators. Kept only with 9 digits or more, so dates
// (2026-10-21), times and years stay.
const PHONE = /\+?\(?\d[\d\s().-]{6,}\d/g;

// Contact details and links never go to a model (spec: minimize personal data sent to AI
// providers). The model sees "[email]", "[phone]" and "[link]" in their place.
export function maskForModel(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(LINK, (link) => {
      const trailing = link.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
      return `[link]${trailing}`;
    })
    .replace(PHONE, (run) => {
      const digits = run.replace(/\D/g, "").length;
      if (digits < 9) return run;
      const lead = run.match(/^\s*/)?.[0] ?? "";
      const tail = run.match(/\s*$/)?.[0] ?? "";
      return `${lead}[phone]${tail}`;
    });
}

const REJECTION = [
  /move forward with other candidates/i,
  /(?:pursue|proceed with|progress with) other candidates/i,
  /\b(?:not|won'?t|won’t)\s+be\s+(?:moving forward|proceeding|progressing)/i,
  /decided not to (?:move forward|proceed|progress)/i,
  /regret to inform you/i,
  /(?:position|role|vacancy) has (?:already )?been filled/i,
  /unable to offer you/i,
  /(?:you have|you've|were) not been selected/i,
];

const RECEIVED = [
  /thank(?:s| you) for (?:applying|your application)/i,
  /(?:we(?: have|'ve)?|we’ve) received your application/i,
  /your application (?:has been|was) (?:received|submitted)/i,
  /application received/i,
];

// A thank-you that also asks for something is not a plain confirmation.
const ASKS_FOR_MORE = /\b(?:interview|assessment|challenge|test|assignment|offer|schedule|call|availability|chat)\b/i;

// The clause (between sentence breaks or commas) where the phrase sits, as the quote.
function clauseAround(text: string, index: number, length: number): string {
  const breaks = /[.!?\n,;]/;
  let start = index;
  while (start > 0 && !breaks.test(text[start - 1]!)) start -= 1;
  let end = index + length;
  while (end < text.length && !breaks.test(text[end]!)) end += 1;
  return text.slice(start, end).trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = pattern.exec(text);
    if (found) return clauseAround(text, found.index, found[0].length);
  }
  return null;
}

// The ATS templates the rules are sure about: a rejection, and a confirmation that asks for
// nothing else. Everything else goes to the model (or stays UNCLEAR without one).
export function classifyByRules(message: { subject: string; body: string }): ClassificationResult | null {
  const text = `${message.subject}\n${message.body}`;
  const rejection = firstMatch(text, REJECTION);
  if (rejection) return { classification: "REJECTION", evidence: rejection };
  if (ASKS_FOR_MORE.test(text)) return null;
  const received = firstMatch(text, RECEIVED);
  if (received) return { classification: "APPLICATION_RECEIVED", evidence: received };
  return null;
}

// A model's class stands only on a quote found in the text it was given (ADR-016's evidence
// rule). Without one the message is UNCLEAR: no status is inferred from it (spec A10).
export function groundClassification(raw: ClassificationResult, text: string): ClassificationResult {
  if (raw.classification === "UNCLEAR") return { classification: "UNCLEAR", evidence: "" };
  const quote = raw.evidence.trim();
  if (!quoteAppearsIn(quote, text)) return { classification: "UNCLEAR", evidence: "" };
  return { classification: raw.classification, evidence: quote };
}
