import { z } from "zod";
import type {
  ContentPlanStatus,
  ContentPlanTopic,
  ContentPlanTopicPublic,
  OpportunityPayload,
  OpportunitySetPublic,
  TextProviderName,
} from "@studio/shared";
import { contentPlanTopicSchema } from "@studio/shared";
import { malformedAiOutput, notFound, validationError } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  CONTENT_PLAN_EXTRACTION_PROMPT_VERSION,
  CONTENT_PLAN_EXTRACTION_SYSTEM_PROMPT,
  buildContentPlanExtractionUserPrompt,
} from "../ai/prompts/content-plan-extraction.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import type { NormalizedNewsArticle } from "../news/news-provider.js";
import type { ResearchRepository } from "../news/research-repository.js";
import type { OpportunityRepository } from "../opportunities/opportunity-repository.js";
import type { OpportunityService } from "../opportunities/opportunity-service.js";
import type { PersonaService } from "../persona/persona-service.js";
import { extractPdfText } from "../profile/pdf-text.js";
import type { ProfileService } from "../profile/profile-service.js";
import { mapFormatToAngle } from "./content-plan-angle.js";
import type { ContentPlanRepository } from "./content-plan-repository.js";
import { PLAN_TOPICS } from "./plan-data.js";

export const CONTENT_PLAN_PROMPT_VERSION = "content-plan.v1";

const extractedTopicsSchema = z.object({
  topics: z.array(contentPlanTopicSchema).min(1),
});

// The model is asked for a 0-100 priority but sometimes echoes a slightly
// out-of-range ranking number from the source document (e.g. 101, 105).
// Clamping is a deterministic normalization of a ranking field, not a
// factual claim, so it's safe to correct here rather than reject the batch.
function clampPriorities(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("topics" in value)) {
    return value;
  }
  const topics = (value as { topics: unknown }).topics;
  if (!Array.isArray(topics)) {
    return value;
  }
  return {
    ...value,
    topics: topics.map((topic) => {
      if (!topic || typeof topic !== "object" || !("priority" in topic)) {
        return topic;
      }
      const priority = (topic as { priority: unknown }).priority;
      if (typeof priority !== "number") {
        return topic;
      }
      return { ...topic, priority: Math.min(100, Math.max(0, priority)) };
    }),
  };
}

export class ContentPlanService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly personas: PersonaService,
    private readonly research: ResearchRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly opportunityService: OpportunityService,
    private readonly repo: ContentPlanRepository,
    private readonly textProviders: Record<TextProviderName, TextGenerationProvider>,
    private readonly defaultTextProvider: TextProviderName,
  ) {}

  async list(): Promise<ContentPlanTopicPublic[]> {
    const [statuses, topics] = await Promise.all([
      this.repo.listStatuses(),
      this.activeTopics(),
    ]);
    return topics.map((topic) => {
      const row = statuses.get(topic.id);
      return {
        ...topic,
        status: (row?.status as ContentPlanStatus) ?? "PLANNED",
        contentOpportunityId: row?.contentOpportunityId ?? null,
        generatedPostId: row?.generatedPostId ?? null,
      };
    });
  }

  async extractFromDocument(
    bytes: Buffer,
    provider?: TextProviderName,
  ): Promise<ContentPlanTopic[]> {
    const documentText = await extractPdfText(bytes);
    const prompt = {
      purpose: CONTENT_PLAN_EXTRACTION_PROMPT_VERSION,
      system: CONTENT_PLAN_EXTRACTION_SYSTEM_PROMPT,
      user: buildContentPlanExtractionUserPrompt(documentText),
    };
    const text = resolveTextProvider(this.textProviders, this.defaultTextProvider, provider);
    const generated = await text.generateText(prompt);
    const parsed = extractedTopicsSchema.safeParse(
      clampPriorities(parseJsonObject(generated.text)),
    );
    if (!parsed.success) {
      throw malformedAiOutput(
        "The model returned content plan topics that did not match the required structure.",
      );
    }
    return parsed.data.topics;
  }

  async saveUploadedTopics(topics: unknown, sourceFilename: string): Promise<ContentPlanTopicPublic[]> {
    const parsed = z.array(contentPlanTopicSchema).min(1).safeParse(topics);
    if (!parsed.success) {
      throw validationError("The content plan topics payload is invalid.");
    }
    await this.repo.saveUpload(parsed.data, sourceFilename);
    return this.list();
  }

  private async activeTopics(): Promise<ContentPlanTopic[]> {
    return (await this.repo.getActiveTopics()) ?? PLAN_TOPICS;
  }

  private async findTopic(topicId: string): Promise<ContentPlanTopic | undefined> {
    const topics = await this.activeTopics();
    return topics.find((topic) => topic.id === topicId);
  }

  async selectTopic(topicId: string): Promise<OpportunitySetPublic> {
    const topic = await this.findTopic(topicId);
    if (!topic) {
      throw notFound("That content plan topic does not exist.");
    }

    const profile = await this.profiles.getProfile();
    const persona = await this.personas.getPersona();
    if (!profile || !persona) {
      throw notFound("Generate a persona before using the content plan.");
    }

    const primarySource = topic.sources[0];
    if (!primarySource) {
      throw notFound("The content plan topic has no bibliography source.");
    }
    const synthetic: NormalizedNewsArticle = {
      title: topic.title,
      description: topic.hook,
      source: "LinkedIn Technical Publishing Plan",
      url: primarySource.url,
      publishedAt: new Date(topic.date),
      topics: [topic.pillar],
      provider: "content_plan",
      providerArticleId: topic.id,
    };

    const research = await this.research.create({
      personaId: persona.id,
      queryTopics: [topic.pillar],
      articles: [synthetic],
      source: "content_plan",
    });
    const article = research.articles[0];
    if (!article) {
      throw notFound("The content plan topic could not be prepared.");
    }

    const payload: OpportunityPayload = {
      topic: topic.title,
      sourceEvent: "LinkedIn Technical Publishing Plan · v1.0",
      whyItMatters: topic.objective,
      whyItFits: topic.pillarValue,
      audienceCare: topic.hook,
      targetAudience: "Recruiters and engineering leaders",
      thesis: topic.hook,
      pointOfView: topic.keyPoints.join("; "),
      storytellingDirection: topic.format,
      readerTakeaway: topic.cta,
      credibilityRisk: topic.confidentiality,
      evidence: topic.keyPoints,
      angle: mapFormatToAngle(topic.format),
    };

    const created = await this.opportunities.create({
      researchRunId: research.run.id,
      personaId: persona.id,
      promptVersion: CONTENT_PLAN_PROMPT_VERSION,
      model: "deterministic",
      source: "content_plan",
      opportunities: [
        {
          articleId: article.id,
          matchScore: Math.round(topic.priority),
          payload,
        },
      ],
    });
    const opportunityRow = created?.rows[0];
    if (!created || !opportunityRow) {
      throw notFound("The content plan opportunity could not be saved.");
    }

    const result = await this.opportunityService.select(opportunityRow.id, "content_plan");
    await this.repo.upsertStatus(topic.id, {
      status: "SELECTED",
      contentOpportunityId: opportunityRow.id,
    });
    return result;
  }

  async updateStatus(topicId: string, status: ContentPlanStatus): Promise<ContentPlanTopicPublic[]> {
    if (!(await this.findTopic(topicId))) {
      throw notFound("That content plan topic does not exist.");
    }
    await this.repo.upsertStatus(topicId, { status });
    return this.list();
  }
}
