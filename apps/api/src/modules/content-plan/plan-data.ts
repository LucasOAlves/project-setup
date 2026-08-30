import type { ContentPlanFormat, ContentPlanSource, ContentPlanTopic } from "@studio/shared";

// Example editorial calendar. Replace with your own topics, following the same
// shape — see ContentPlanTopic in packages/shared/src/content-plan.ts.

type PillarGroup = {
  pillar: string;
  pillarValue: string;
  demonstrates: string;
  keyPoints: string[];
  sources: ContentPlanSource[];
};

const EXAMPLE_PILLAR_ONE: PillarGroup = {
  pillar: "Example pillar one",
  pillarValue: "Describe what this pillar signals about your professional authority.",
  demonstrates: "the specific skills or judgment this pillar demonstrates",
  keyPoints: [
    "First point this pillar's posts should make",
    "second point",
    "third point",
    "fourth point",
  ],
  sources: [
    {
      id: "S01",
      author: "Example author",
      title: "Example reference title",
      url: "https://example.com/reference-one",
    },
  ],
};

const EXAMPLE_PILLAR_TWO: PillarGroup = {
  pillar: "Example pillar two",
  pillarValue: "Describe what this second pillar signals about your professional authority.",
  demonstrates: "the specific skills or judgment this pillar demonstrates",
  keyPoints: [
    "First point this pillar's posts should make",
    "second point",
    "third point",
  ],
  sources: [
    {
      id: "S02",
      author: "Example author",
      title: "Example reference title",
      url: "https://example.com/reference-two",
    },
  ],
};

const CTA = "What would you add, and what evidence would change your view?";
const CONFIDENTIALITY = "Needs abstraction; synthetic examples only; no proprietary detail.";

function brief(
  id: string,
  week: number,
  date: string,
  title: string,
  format: ContentPlanFormat,
  priority: number,
  group: PillarGroup,
): ContentPlanTopic {
  const lowerTitle = title.toLowerCase();
  return {
    id,
    week,
    date,
    title,
    format,
    priority,
    pillar: group.pillar,
    pillarValue: group.pillarValue,
    objective: `Give readers a reusable way to reason about ${lowerTitle} while demonstrating ${group.demonstrates}.`,
    hook: `Strong engineering is visible in the decisions around ${lowerTitle}, not in proprietary details.`,
    keyPoints: group.keyPoints,
    cta: CTA,
    evidenceNote: `Abstracted practice supported by ${group.sources.map((source) => source.id).join(", ")}; no internal implementation.`,
    confidentiality: CONFIDENTIALITY,
    sources: group.sources,
  };
}

export const PLAN_TOPICS: ContentPlanTopic[] = [
  brief("T01", 1, "2026-01-05", "Example Topic One", "NARRATIVE", 95, EXAMPLE_PILLAR_ONE),
  brief("T02", 1, "2026-01-07", "Example Topic Two", "CHECKLIST", 97, EXAMPLE_PILLAR_ONE),
  brief("T03", 2, "2026-01-12", "Example Topic Three", "DOCUMENT", 90, EXAMPLE_PILLAR_TWO),
  brief("T04", 2, "2026-01-14", "Example Topic Four", "DIAGRAM", 88, EXAMPLE_PILLAR_TWO),
];

export function findPlanTopic(topicId: string): ContentPlanTopic | undefined {
  return PLAN_TOPICS.find((topic) => topic.id === topicId);
}
