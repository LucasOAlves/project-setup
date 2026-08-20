import {
  ANGLE_TYPES,
  POST_PROMPT_VERSION,
  WRITING_TONES,
  modelDraftSchema,
  modelEditSchema,
  modelReviewSchema,
  type AngleType,
  type ModelDraft,
  type OpportunityPublic,
  type PersonaPublic,
  type PostEditAction,
  type PostPublic,
  type ProfilePublic,
  type WritingTone,
} from "@studio/shared";
import { malformedAiOutput, notFound, validationError } from "../../app-error.js";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  POST_DRAFT_SYSTEM_PROMPT,
  buildPostDraftUserPrompt,
} from "../ai/prompts/post-draft.v1.js";
import {
  POST_EDIT_SYSTEM_PROMPT,
  buildPostEditUserPrompt,
} from "../ai/prompts/post-edit.v1.js";
import {
  POST_REVIEW_SYSTEM_PROMPT,
  buildPostReviewUserPrompt,
} from "../ai/prompts/post-review.v1.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import type { OpportunityService } from "../opportunities/opportunity-service.js";
import type { PersonaService } from "../persona/persona-service.js";
import type { ProfileService } from "../profile/profile-service.js";
import { groundReviewedPost, groundStoryStrategy } from "./ground-post.js";
import type { PostRepository } from "./post-repository.js";

export function buildPostDraftPrompt(input: {
  profile: ProfilePublic;
  persona: PersonaPublic;
  opportunity: OpportunityPublic;
}) {
  return {
    purpose: POST_PROMPT_VERSION,
    system: POST_DRAFT_SYSTEM_PROMPT,
    user: buildPostDraftUserPrompt({
      profile: input.profile,
      persona: input.persona.persona,
      opportunity: input.opportunity,
    }),
  };
}

export class PostService {
  constructor(
    private readonly profiles: ProfileService,
    private readonly personas: PersonaService,
    private readonly opportunities: OpportunityService,
    private readonly posts: PostRepository,
    private readonly text: TextGenerationProvider,
  ) {}

  async getLatest(): Promise<PostPublic | null> {
    const row = await this.posts.getLatest();
    if (!row) {
      return null;
    }
    return this.toPublic(row);
  }

  async generate(): Promise<PostPublic> {
    const context = await this.requireWriteContext();
    return this.persistReviewed(context, await this.draftAndReview(context));
  }

  async edit(input: {
    action: PostEditAction;
    tone?: WritingTone;
    angle?: AngleType;
    section?: string;
  }): Promise<PostPublic> {
    const current = await this.getLatest();
    if (!current) {
      throw notFound("Write a post before editing it.");
    }
    const context = await this.requireWriteContext(current.opportunityId);
    const generated = await this.text.generateText({
      purpose: POST_PROMPT_VERSION,
      system: POST_EDIT_SYSTEM_PROMPT,
      user: buildPostEditUserPrompt({
        post: current,
        action: input.action,
        tone: input.tone,
        angle: input.angle,
        section: input.section,
      }),
    });
    const parsed = modelEditSchema.safeParse(parseJsonObject(generated.text));
    if (!parsed.success) {
      throw malformedAiOutput("The model returned an edit that did not match the required structure.");
    }

    const draft: ModelDraft = {
      storyStrategy: current.storyStrategy,
      hook: parsed.data.hook,
      body: parsed.data.body,
    };
    const reviewed = await this.reviewDraft(context, draft, generated.model);
    return this.persistReviewed(
      {
        ...context,
        tone: input.tone ?? current.tone,
        angle: input.angle ?? current.angle,
      },
      reviewed,
    );
  }

  private async draftAndReview(context: WriteContext) {
    const draftGenerated = await this.text.generateText(buildPostDraftPrompt(context));
    const draftParsed = modelDraftSchema.safeParse(parseJsonObject(draftGenerated.text));
    if (!draftParsed.success) {
      throw malformedAiOutput("The model returned a draft that did not match the required structure.");
    }
    const draft: ModelDraft = {
      ...draftParsed.data,
      storyStrategy: groundStoryStrategy(draftParsed.data.storyStrategy, context.profile),
    };
    return this.reviewDraft(context, draft, draftGenerated.model);
  }

  private async reviewDraft(context: WriteContext, draft: ModelDraft, previousModel: string) {
    const reviewed = await this.text.generateText({
      purpose: POST_PROMPT_VERSION,
      system: POST_REVIEW_SYSTEM_PROMPT,
      user: buildPostReviewUserPrompt({
        profile: context.profile,
        persona: context.persona.persona,
        opportunity: context.opportunity,
        draft,
      }),
    });
    const parsed = modelReviewSchema.safeParse(parseJsonObject(reviewed.text));
    if (!parsed.success) {
      throw malformedAiOutput("The model returned a review that did not match the required structure.");
    }
    return {
      model: [previousModel, reviewed.model].filter(Boolean).join("+"),
      draft,
      review: groundReviewedPost({
        draft,
        review: parsed.data,
        profile: context.profile,
        opportunity: context.opportunity,
      }),
    };
  }

  private async persistReviewed(
    context: WriteContext,
    produced: Awaited<ReturnType<PostService["reviewDraft"]>>,
  ) {
    const row = await this.posts.create({
      opportunityId: context.opportunity.id,
      promptVersion: POST_PROMPT_VERSION,
      model: produced.model,
      tone: context.tone,
      angle: context.angle,
      hook: produced.review.hook,
      body: produced.review.body,
      storyStrategy: produced.draft.storyStrategy,
      writingReview: produced.review.writingReview,
      factReview: produced.review.factReview,
      seoReview: produced.review.seoReview,
      quality: produced.review.quality,
    });
    if (!row) {
      throw malformedAiOutput("The post could not be saved.");
    }
    return this.toPublic(row);
  }

  private async requireWriteContext(opportunityId?: string): Promise<WriteContext> {
    const profile = await this.profiles.getProfile();
    const persona = await this.personas.getPersona();
    if (!profile || !persona) {
      throw notFound("Generate a persona before writing a post.");
    }

    const opportunity = opportunityId
      ? await this.opportunities.getById(opportunityId)
      : await this.opportunities.getSelected();
    if (!opportunity) {
      throw validationError("Select an angle before writing a post.");
    }

    const tone = profile.writingTones[0] ?? WRITING_TONES[0];
    const angle = opportunity.payload.angle;
    return { profile, persona, opportunity, tone, angle };
  }

  private async toPublic(
    row: NonNullable<Awaited<ReturnType<PostRepository["getLatest"]>>>,
  ): Promise<PostPublic> {
    const opportunity = await this.opportunities.getById(row.opportunityId);
    const tone = WRITING_TONES.includes(row.tone as WritingTone)
      ? (row.tone as WritingTone)
      : WRITING_TONES[0];
    const angle = ANGLE_TYPES.includes(row.angle as AngleType)
      ? (row.angle as AngleType)
      : opportunity?.payload.angle ?? ANGLE_TYPES[0];

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      promptVersion: row.promptVersion,
      model: row.model,
      tone,
      angle,
      opportunityId: row.opportunityId,
      sourceTitle: opportunity?.article.title ?? "",
      sourceUrl: opportunity?.article.url ?? "",
      hook: row.hook,
      body: row.body,
      storyStrategy: row.storyStrategy,
      writingReview: row.writingReview,
      factReview: row.factReview,
      seoReview: row.seoReview,
      quality: row.quality,
    };
  }
}

type WriteContext = {
  profile: ProfilePublic;
  persona: PersonaPublic;
  opportunity: OpportunityPublic;
  tone: WritingTone;
  angle: AngleType;
};
