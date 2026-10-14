import { quoteAppearsIn } from "./job-explanation-grounding.js";
import { detectTechnologies } from "./job-matching.js";

// Cover letter grounding (Milestone 2, ADR-010's draft pattern). A letter is new prose, so every
// sentence must cite the profile or the posting, and is dropped when:
// - it has no evidence, or a quote is not in the text it names;
// - it uses a number not found in the texts it cites;
// - it cites the profile and names a technology the profile lacks (a sentence citing only the
//   posting may name the posting's technologies, since it talks about the job);
// - it cites only the posting but makes a claim about the candidate ("I have…", "my experience…"),
//   which only the profile can support.

export const MAX_PARAGRAPHS = 4;

export type CoverLetterEvidence = { source: "PROFILE" | "JOB"; quote: string };
export type RawCoverLetter = {
  paragraphs: Array<{ sentences: Array<{ text: string; evidence: CoverLetterEvidence[] }> }>;
};
export type GroundedCoverLetter = { paragraphs: string[]; droppedSentences: number };

export type CoverLetterContext = { profileText: string; jobText: string; profileTechnologies: string[] };

const NUMBER = /\d+(?:[.,]\d+)*%?/g;
const CANDIDATE_CLAIM = /\b(?:I|I'm|I've|I'd|I'll)\b|\bmy (?:experience|background|work|skills|track record|career)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberIn(token: string, text: string): boolean {
  return new RegExp(`(?<![\\d.,])${escapeRegExp(token)}(?!\\d)`).test(text);
}

function sentenceSupported(
  sentence: { text: string; evidence: CoverLetterEvidence[] },
  context: CoverLetterContext,
  profileTechs: Set<string>,
): boolean {
  if (!sentence.text.trim() || sentence.evidence.length === 0) return false;
  const sourceText = (source: CoverLetterEvidence["source"]) => (source === "PROFILE" ? context.profileText : context.jobText);
  if (!sentence.evidence.every((item) => quoteAppearsIn(item.quote, sourceText(item.source)))) return false;

  const citesProfile = sentence.evidence.some((item) => item.source === "PROFILE");
  if (!citesProfile && CANDIDATE_CLAIM.test(sentence.text)) return false;

  const cited = [...new Set(sentence.evidence.map((item) => sourceText(item.source)))].join("\n");
  if (!(sentence.text.match(NUMBER) ?? []).every((token) => numberIn(token, cited))) return false;

  const allowedTechs = citesProfile ? profileTechs : new Set(detectTechnologies(context.jobText));
  return detectTechnologies(sentence.text).every((tech) => allowedTechs.has(tech));
}

export function groundCoverLetter(raw: RawCoverLetter, context: CoverLetterContext): GroundedCoverLetter {
  const profileTechs = new Set(detectTechnologies(`${context.profileText}\n${context.profileTechnologies.join(", ")}`));
  const paragraphs: string[] = [];
  let dropped = 0;
  for (const paragraph of raw.paragraphs) {
    const kept: string[] = [];
    for (const sentence of paragraph.sentences) {
      if (sentenceSupported(sentence, context, profileTechs)) kept.push(sentence.text.trim());
      else dropped += 1;
    }
    if (kept.length > 0 && paragraphs.length < MAX_PARAGRAPHS) paragraphs.push(kept.join(" "));
  }
  return { paragraphs, droppedSentences: dropped };
}
