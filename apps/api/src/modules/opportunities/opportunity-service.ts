import {
  OPPORTUNITY_PROMPT_VERSION,
  modelOpportunitySetSchema,
  type OpportunityPublic,
  type OpportunitySetPublic,
  type PersonaPublic,
  type ProfilePublic,
  type TextProviderName,
} from "@studio/shared";
import { malformedAiOutput, notFound, validationError } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  OPPORTUNITY_SYSTEM_PROMPT,
  buildOpportunityUserPrompt,
} from "../ai/prompts/opportunity.v1.js";
import { resolveTextProvider } from "../ai/resolve-provider.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import type { PersonaService } from "../persona/persona-service.js";
import type { ProfileService } from "../profile/profile-service.js";
import type { ResearchRepository } from "../news/research-repository.js";
import { groundEvaluations } from "./ground-opportunities.js";
import type { OpportunityRepository, OpportunitySource } from "./opportunity-repository.js";
import { scoreCandidate, type ScoredCandidate } from "./relevance.js";

export function buildOpportunityPrompt(input: {
  profile: ProfilePublic;
  persona: PersonaPublic;
  candidates: ScoredCandidate[];
}) {
  return {
    purpose: OPPORTUNITY_PROMPT_VERSION,
    system: OPPORTUNITY_SYSTEM_PROMPT,
    user: buildOpportunityUserPrompt({
      profile: input.profile,
      persona: input.persona.persona,
      candidates: input.candidates,
    }),
  };
}

export class OpportunityService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly personas: PersonaService,
    private readonly research: ResearchRepository,
    private readonly opportunities: OpportunityRepository,
    private readonly textProviders: Record<TextProviderName, TextGenerationProvider>,
    private readonly defaultTextProvider: TextProviderName,
  ) {}

  async getLatest(): Promise<OpportunitySetPublic | null> {
    const record = await this.opportunities.getLatest("discover");
    if (!record) {
      return null;
    }
    return this.toPublic(record);
  }

  async generate(provider?: TextProviderName): Promise<OpportunitySetPublic> {
    const profile = await this.profiles.getProfile();
    const persona = await this.personas.getPersona();
    const research = await this.research.getLatest("discover");
    if (!profile || !persona) {
      throw notFound("Generate a persona before creating opportunities.");
    }
    if (!research || research.articles.length === 0) {
      throw notFound("Discover current events before creating opportunities.");
    }

    const candidates = research.articles
      .map((article) =>
        scoreCandidate({
          articleId: article.id,
          title: article.title,
          description: article.description,
          source: article.source,
          url: article.url,
          publishedAt: article.publishedAt,
          topics: research.run.queryTopics,
        }),
      )
      .filter((candidate): candidate is ScoredCandidate => candidate !== null)
      .sort((left, right) => right.combined - left.combined)
      .slice(0, 5);

    if (candidates.length === 0) {
      const record = await this.opportunities.create({
        researchRunId: research.run.id,
        personaId: persona.id,
        promptVersion: OPPORTUNITY_PROMPT_VERSION,
        model: "deterministic",
        source: "discover",
        opportunities: [],
      });
      if (!record) {
        throw malformedAiOutput("The opportunity set could not be saved.");
      }
      return this.toPublic(record);
    }

    const text = resolveTextProvider(this.textProviders, this.defaultTextProvider, provider);
    const generated = await text.generateText(
      buildOpportunityPrompt({ profile, persona, candidates }),
    );
    const parsed = modelOpportunitySetSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput(
        "The model returned opportunities that did not match the required structure.",
      );
    }

    const grounded = groundEvaluations({
      evaluations: parsed.data.evaluations,
      candidates,
      persona: persona.persona,
    });

    const record = await this.opportunities.create({
      researchRunId: research.run.id,
      personaId: persona.id,
      promptVersion: OPPORTUNITY_PROMPT_VERSION,
      model: generated.model,
      source: "discover",
      opportunities: grounded,
    });
    if (!record) {
      throw malformedAiOutput("The opportunity set could not be saved.");
    }
    return this.toPublic(record);
  }

  async select(
    opportunityId: string,
    source: OpportunitySource = "discover",
  ): Promise<OpportunitySetPublic> {
    const latest = await this.opportunities.getLatest(source);
    if (!latest) {
      throw notFound("Generate opportunities before selecting an angle.");
    }
    const record = await this.opportunities.select(latest.set.id, opportunityId);
    if (!record) {
      throw validationError("That opportunity is not part of the current set.");
    }
    return this.toPublic(record);
  }

  async getCurrentSelection(): Promise<OpportunitySetPublic | null> {
    const record = await this.opportunities.getMostRecentlySelected();
    if (!record) {
      return null;
    }
    return this.toPublic(record);
  }

  async getSelected(): Promise<OpportunityPublic | null> {
    const current = await this.getCurrentSelection();
    if (!current?.selectedOpportunityId) {
      return null;
    }
    return current.opportunities.find((item) => item.selected) ?? null;
  }

  async getById(opportunityId: string): Promise<OpportunityPublic | null> {
    const record = await this.opportunities.getById(opportunityId);
    if (!record) {
      return null;
    }
    return this.toPublic(record).opportunities[0] ?? null;
  }

  private toPublic(
    record: NonNullable<Awaited<ReturnType<OpportunityRepository["getLatest"]>>>,
  ): OpportunitySetPublic {
    const articles = new Map(record.articles.map((article) => [article.id, article]));
    const opportunities = [...record.rows]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .flatMap((row) => {
        const article = articles.get(row.articleId);
        if (!article) {
          return [];
        }
        return [
          {
            id: row.id,
            matchScore: row.matchScore,
            selected: record.set.selectedOpportunityId === row.id,
            article: {
              id: article.id,
              title: article.title,
              description: article.description,
              source: article.source,
              url: article.url,
              publishedAt: article.publishedAt.toISOString(),
              topics: article.topics,
            },
            payload: row.payload,
          },
        ];
      });

    return {
      id: record.set.id,
      createdAt: record.set.createdAt.toISOString(),
      promptVersion: record.set.promptVersion,
      model: record.set.model,
      emptyReason: opportunities.length === 0 ? "NO_RELEVANT_TOPICS" : null,
      selectedOpportunityId: record.set.selectedOpportunityId,
      opportunities,
    };
  }
}
