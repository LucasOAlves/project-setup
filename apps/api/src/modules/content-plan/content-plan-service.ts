import type {
  ContentPlanStatus,
  ContentPlanTopicPublic,
  OpportunityPayload,
  OpportunitySetPublic,
} from "@studio/shared";
import { notFound } from "../../app-error.js";
import type { NormalizedNewsArticle } from "../news/news-provider.js";
import type { ResearchRepository } from "../news/research-repository.js";
import type { OpportunityRepository } from "../opportunities/opportunity-repository.js";
import type { OpportunityService } from "../opportunities/opportunity-service.js";
import type { PersonaService } from "../persona/persona-service.js";
import type { ProfileService } from "../profile/profile-service.js";
import { mapFormatToAngle } from "./content-plan-angle.js";
import type { ContentPlanRepository } from "./content-plan-repository.js";
import { findPlanTopic, PLAN_TOPICS } from "./plan-data.js";

export const CONTENT_PLAN_PROMPT_VERSION = "content-plan.v1";

export class ContentPlanService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly personas: PersonaService,
    private readonly research: ResearchRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly opportunityService: OpportunityService,
    private readonly repo: ContentPlanRepository,
  ) {}

  async list(): Promise<ContentPlanTopicPublic[]> {
    const statuses = await this.repo.listStatuses();
    return PLAN_TOPICS.map((topic) => {
      const row = statuses.get(topic.id);
      return {
        ...topic,
        status: (row?.status as ContentPlanStatus) ?? "PLANNED",
        contentOpportunityId: row?.contentOpportunityId ?? null,
        generatedPostId: row?.generatedPostId ?? null,
      };
    });
  }

  async selectTopic(topicId: string): Promise<OpportunitySetPublic> {
    const topic = findPlanTopic(topicId);
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
    if (!findPlanTopic(topicId)) {
      throw notFound("That content plan topic does not exist.");
    }
    await this.repo.upsertStatus(topicId, { status });
    return this.list();
  }
}
