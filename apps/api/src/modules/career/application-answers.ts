import type { ApplicationDetailsPublic } from "@studio/shared";
import { detectTechnologies } from "./job-matching.js";

// Answers to common application questions (Milestone 2, ticket 5), built only from what the user
// stated in application details and the profile. Anything those do not answer is left blank and
// marked NEEDS_INPUT: a form answer is a statement the user makes, so nothing here is guessed.

export type AnswerStatus = "FROM_PROFILE" | "DRAFTED" | "NEEDS_INPUT" | "FROM_YOU";

export type ApplicationAnswer = {
  id: string;
  question: string;
  answer: string;
  status: AnswerStatus;
  note?: string;
};

export type AnswerExperience = { startPeriod: string; endPeriod: string; technologies: string[] };

export type AnswerInput = {
  profile: { yearsOfExperience: number | null; experiences: AnswerExperience[] };
  details: ApplicationDetailsPublic | null;
  // Technologies the job asks for, most important first.
  jobTechnologies: string[];
  now: Date;
};

const MAX_TECHNOLOGY_QUESTIONS = 3;
const ONGOING = /\b(present|current|now|today|atual|hoje)\b/i;
const LEVEL_LABELS: Record<string, string> = {
  NATIVE: "Native",
  FLUENT: "Fluent",
  ADVANCED: "Advanced",
  INTERMEDIATE: "Intermediate",
  BASIC: "Basic",
};

function canonical(technology: string): string {
  return (detectTechnologies(technology)[0] ?? technology.trim()).toLowerCase();
}

function year(text: string): number | null {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export type YearsWithTechnology = { years: number } | { years: null; reason: "NOT_IN_PROFILE" | "UNDATED" };

// Whole years across every experience that lists the technology, overlapping spans counted once.
// Periods are free text, so only a four-digit year is read; an end of "Present" means this year.
export function yearsWithTechnology(experiences: AnswerExperience[], technology: string, now: Date): YearsWithTechnology {
  const target = canonical(technology);
  const matching = experiences.filter((item) => item.technologies.some((tech) => canonical(tech) === target));
  if (matching.length === 0) return { years: null, reason: "NOT_IN_PROFILE" };

  const spans: Array<[number, number]> = [];
  for (const item of matching) {
    const start = year(item.startPeriod);
    const end = year(item.endPeriod) ?? (!item.endPeriod.trim() || ONGOING.test(item.endPeriod) ? now.getUTCFullYear() : null);
    if (start === null || end === null || end < start) return { years: null, reason: "UNDATED" };
    spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [currentStart, currentEnd] = spans[0]!;
  for (const [start, end] of spans.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      [currentStart, currentEnd] = [start, end];
    }
  }
  total += currentEnd - currentStart;
  return { years: total };
}

function yearsText(years: number): string {
  if (years < 1) return "Less than 1 year";
  return years === 1 ? "1 year" : `${years} years`;
}

function answered(id: string, question: string, answer: string | null | undefined): ApplicationAnswer {
  const text = answer?.trim() ?? "";
  return text ? { id, question, answer: text, status: "FROM_PROFILE" } : { id, question, answer: "", status: "NEEDS_INPUT" };
}

export function buildApplicationAnswers(input: AnswerInput): ApplicationAnswer[] {
  const { details, profile } = input;
  const contact = details?.contact;
  const salary = details?.salaryExpectation;
  const english = details?.spokenLanguages.find((item) => item.language.trim().toLowerCase() === "english");
  const sponsorship = details?.requiresVisaSponsorship;

  const answers: ApplicationAnswer[] = [
    answered("WORK_AUTHORIZATION", "What is your work authorization status?", details?.workAuthorization),
    answered(
      "VISA_SPONSORSHIP",
      "Will you now or in the future require visa sponsorship?",
      sponsorship === true
        ? "Yes, I would require visa sponsorship."
        : sponsorship === false
          ? "No, I do not require visa sponsorship."
          : null,
    ),
    answered("NOTICE_PERIOD", "What is your notice period, or when can you start?", details?.noticePeriod),
    answered(
      "SALARY_EXPECTATION",
      "What are your salary expectations?",
      salary ? `${salary.currency} ${salary.amount.toLocaleString("en-US")} per ${salary.period === "MONTH" ? "month" : "year"}` : null,
    ),
    answered("LOCATION", "Where are you located?", [contact?.city, contact?.country].filter(Boolean).join(", ")),
    answered("TIME_ZONE", "What time zone do you work in?", details?.timeZone),
    answered("ENGLISH_LEVEL", "What is your level of English?", english ? LEVEL_LABELS[english.level] : null),
    answered(
      "YEARS_OF_EXPERIENCE",
      "How many years of professional experience do you have?",
      profile.yearsOfExperience === null ? null : yearsText(profile.yearsOfExperience),
    ),
    answered("LINKEDIN", "LinkedIn profile URL", contact?.linkedinUrl),
    answered("GITHUB", "GitHub profile URL", contact?.githubUrl),
    answered("PORTFOLIO", "Portfolio or website URL", contact?.portfolioUrl),
  ];

  for (const technology of input.jobTechnologies.slice(0, MAX_TECHNOLOGY_QUESTIONS)) {
    const id = `YEARS_WITH:${technology}`;
    const question = `How many years of professional experience do you have with ${technology}?`;
    const result = yearsWithTechnology(profile.experiences, technology, input.now);
    if (result.years !== null) {
      answers.push({ id, question, answer: yearsText(result.years), status: "FROM_PROFILE" });
    } else {
      answers.push({
        id,
        question,
        answer: "",
        status: "NEEDS_INPUT",
        note:
          result.reason === "NOT_IN_PROFILE"
            ? `None of your experiences lists ${technology} among its technologies.`
            : `An experience with ${technology} has no year in its dates.`,
      });
    }
  }
  return answers;
}
