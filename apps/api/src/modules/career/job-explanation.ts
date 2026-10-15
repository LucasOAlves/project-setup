import {
  jobExplanationSchema,
  type EligibilityReasonPublic,
  type ExplanationEvidence,
  type GroundedJobExplanation,
  type JobEligibilityStatus,
} from "@studio/shared";
import { malformedAiOutput } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  buildJobExplanationUserPrompt,
  JOB_EXPLANATION_PROMPT_VERSION,
  JOB_EXPLANATION_SYSTEM_PROMPT,
} from "../ai/prompts/job-explanation.v1.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import { groundExplanation } from "./job-explanation-grounding.js";
import type { MatchProfile, MatchResult } from "./job-matching.js";

// Explanation agent (spec A05, JOB-012/013), GENERATE-level per ADR-012: the model writes the
// explanation, then groundExplanation checks every quote against the exact texts sent here,
// so nothing reaches the user that the posting or the profile does not back.

// Bounds what one explanation costs. Grounding uses the same truncated text the model saw.
const MAX_JOB_TEXT = 12_000;

export type ExplainInput = {
  job: { title: string; location: string; description: string };
  profile: MatchProfile;
  eligibility: { status: JobEligibilityStatus; reasons: EligibilityReasonPublic[] };
  match: MatchResult;
};

export type ExplanationOutcome = {
  explanation: GroundedJobExplanation;
  evidence: ExplanationEvidence[];
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
};

export function buildJobText(job: ExplainInput["job"]): string {
  return [`Title: ${job.title}`, `Location: ${job.location || "not stated"}`, "", job.description]
    .join("\n")
    .slice(0, MAX_JOB_TEXT);
}

// Only professional evidence goes to the provider: no name, contact details or employer
// names (spec §6, minimize personal data sent to AI providers).
export function buildProfileText(profile: MatchProfile): string {
  const lines = [
    `Years of experience: ${profile.yearsOfExperience ?? "not stated"}`,
    `Top skills: ${profile.topSkills.join(", ") || "none listed"}`,
    `Technologies: ${profile.technologies.join(", ") || "none listed"}`,
  ];
  if (profile.architectureExperience.trim()) lines.push(`Architecture experience: ${profile.architectureExperience}`);
  if (profile.leadershipExperience.trim()) lines.push(`Leadership experience: ${profile.leadershipExperience}`);
  profile.experiences.forEach((item, index) => {
    lines.push("", `Experience ${index + 1}: ${item.role || "role not stated"}`);
    for (const text of [item.description, item.responsibilities, item.achievements, item.measurableOutcomes]) {
      if (text.trim()) lines.push(text);
    }
    if (item.technologies.length > 0) lines.push(`Technologies used: ${item.technologies.join(", ")}`);
  });
  return lines.join("\n");
}

export class JobExplainer {
  constructor(private readonly text: TextGenerationProvider) {}

  async explain(input: ExplainInput): Promise<ExplanationOutcome> {
    const jobText = buildJobText(input.job);
    const profileText = buildProfileText(input.profile);
    const generated = await this.text.generateText({
      purpose: JOB_EXPLANATION_PROMPT_VERSION,
      system: JOB_EXPLANATION_SYSTEM_PROMPT,
      user: buildJobExplanationUserPrompt({
        jobText,
        profileText,
        rules: {
          eligibility: input.eligibility.status,
          eligibilityReasons: input.eligibility.reasons,
          score: input.match.score,
          confidence: input.match.confidence,
          dimensions: Object.fromEntries(
            Object.entries(input.match.dimensions).map(([key, value]) => [key, { score: value.score, known: value.known }]),
          ),
          matchedSkills: input.match.matchedSkills,
          missingSkills: input.match.missingSkills,
          flags: input.match.flags,
        },
      }),
    });

    const parsed = jobExplanationSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput("The model returned a job explanation that did not match the required structure.");
    }
    const grounded = groundExplanation(parsed.data, {
      jobText,
      profileText,
      eligibility: input.eligibility.status,
    });

    return {
      ...grounded,
      model: generated.model,
      promptVersion: JOB_EXPLANATION_PROMPT_VERSION,
      inputTokens: generated.usage?.inputTokens ?? 0,
      outputTokens: generated.usage?.outputTokens ?? 0,
    };
  }
}
