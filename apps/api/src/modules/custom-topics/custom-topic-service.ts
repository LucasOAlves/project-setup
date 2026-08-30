import type {
  AngleType,
  CustomTopicInput,
  CustomTopicPublic,
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
import type { CustomTopicRepository, CustomTopicRow } from "./custom-topic-repository.js";

export const CUSTOM_TOPIC_PROMPT_VERSION = "custom-topic.v1";

export class CustomTopicService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly personas: PersonaService,
    private readonly research: ResearchRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly opportunityService: OpportunityService,
    private readonly repo: CustomTopicRepository,
  ) {}

  async list(): Promise<CustomTopicPublic[]> {
    const rows = await this.repo.list();
    return rows.map((row) => this.toPublic(row));
  }

  async create(input: CustomTopicInput): Promise<CustomTopicPublic> {
    const row = await this.repo.create(input);
    return this.toPublic(row);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async selectTopic(id: string): Promise<OpportunitySetPublic> {
    const topic = await this.repo.getById(id);
    if (!topic) {
      throw notFound("That topic does not exist.");
    }

    const profile = await this.profiles.getProfile();
    const persona = await this.personas.getPersona();
    if (!profile || !persona) {
      throw notFound("Generate a persona before using a custom topic.");
    }

    const synthetic: NormalizedNewsArticle = {
      title: topic.title,
      description: topic.hook,
      source: "Custom topic",
      url: topic.sourceUrl ?? `https://app.local/custom-topics/${topic.id}`,
      publishedAt: new Date(),
      topics: topic.pillar ? [topic.pillar] : [],
      provider: "custom",
      providerArticleId: topic.id,
    };

    const research = await this.research.create({
      personaId: persona.id,
      queryTopics: topic.pillar ? [topic.pillar] : [topic.title],
      articles: [synthetic],
      source: "custom",
    });
    const article = research.articles[0];
    if (!article) {
      throw notFound("The custom topic could not be prepared.");
    }

    const payload: OpportunityPayload = {
      topic: topic.title,
      sourceEvent: "User-authored topic",
      whyItMatters: topic.objective || topic.hook,
      whyItFits: topic.objective || topic.hook,
      audienceCare: topic.hook,
      targetAudience: profile.targetAudience || "Your professional audience",
      thesis: topic.hook,
      pointOfView: topic.keyPoints.join("; "),
      storytellingDirection: "User-authored topic",
      readerTakeaway: topic.cta || "Invite a reply from readers with direct experience.",
      credibilityRisk: "User-authored topic; verify claims before publishing.",
      evidence: topic.keyPoints,
      angle: topic.angle as AngleType,
    };

    const created = await this.opportunities.create({
      researchRunId: research.run.id,
      personaId: persona.id,
      promptVersion: CUSTOM_TOPIC_PROMPT_VERSION,
      model: "deterministic",
      source: "custom",
      opportunities: [
        {
          articleId: article.id,
          matchScore: 100,
          payload,
        },
      ],
    });
    const opportunityRow = created?.rows[0];
    if (!created || !opportunityRow) {
      throw notFound("The custom topic opportunity could not be saved.");
    }

    const result = await this.opportunityService.select(opportunityRow.id, "custom");
    await this.repo.updateStatus(topic.id, {
      status: "SELECTED",
      contentOpportunityId: opportunityRow.id,
    });
    return result;
  }

  async updateStatus(id: string, status: string): Promise<CustomTopicPublic[]> {
    const topic = await this.repo.getById(id);
    if (!topic) {
      throw notFound("That topic does not exist.");
    }
    await this.repo.updateStatus(id, { status });
    return this.list();
  }

  private toPublic(row: NonNullable<CustomTopicRow>): CustomTopicPublic {
    return {
      id: row.id,
      title: row.title,
      hook: row.hook,
      objective: row.objective,
      keyPoints: row.keyPoints,
      cta: row.cta,
      angle: row.angle as AngleType,
      pillar: row.pillar,
      sourceUrl: row.sourceUrl,
      status: row.status as CustomTopicPublic["status"],
      contentOpportunityId: row.contentOpportunityId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
