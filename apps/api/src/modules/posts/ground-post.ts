import type {
  FactClaim,
  FactReview,
  ModelDraft,
  ModelReview,
  OpportunityPublic,
  ProfilePublic,
  StoryStrategy,
} from "@studio/shared";

const FIRST_PERSON =
  /\bI (?:led|built|shipped|managed|founded|scaled|ran|owned|created|launched|hired|sold)\b/i;

export function profileEvidenceCorpus(profile: ProfilePublic): string {
  return [
    profile.headline,
    profile.currentJobTitle,
    profile.currentCompany,
    profile.about,
    profile.architectureExperience,
    profile.leadershipExperience,
    profile.businessImpact,
    ...profile.topSkills,
    ...profile.technologies,
    ...profile.experiences.flatMap((experience) => [
      experience.role,
      experience.company,
      experience.description,
      experience.responsibilities,
      experience.achievements,
      experience.measurableOutcomes,
      ...experience.technologies,
    ]),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function evidenceInCorpus(evidence: string, corpus: string): boolean {
  const lowered = evidence.toLowerCase().trim();
  if (!lowered) {
    return false;
  }
  if (corpus.includes(lowered)) {
    return true;
  }
  const tokens = lowered.split(/\W+/).filter((token) => token.length >= 4);
  return tokens.some((token) => corpus.includes(token));
}

export function urlsEquivalent(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const pathA = a.pathname.replace(/\/$/, "");
    const pathB = b.pathname.replace(/\/$/, "");
    return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") && pathA === pathB;
  } catch {
    return left.trim() === right.trim();
  }
}

export function groundStoryStrategy(
  strategy: StoryStrategy,
  profile: ProfilePublic,
): StoryStrategy {
  const corpus = profileEvidenceCorpus(profile);
  const evidenceToUse = strategy.evidenceToUse.filter((item) => evidenceInCorpus(item, corpus));
  if (evidenceToUse.length > 0) {
    return { ...strategy, evidenceToUse };
  }

  const fallback = [profile.headline, profile.currentJobTitle, profile.currentCompany].filter(
    (item) => item.trim().length > 0,
  );
  return {
    ...strategy,
    evidenceToUse: fallback.length > 0 ? fallback.slice(0, 3) : ["Saved profile evidence is limited"],
  };
}

export function groundReviewedPost(input: {
  draft: ModelDraft;
  review: ModelReview;
  profile: ProfilePublic;
  opportunity: OpportunityPublic;
}): ModelReview {
  const corpus = profileEvidenceCorpus(input.profile);
  const articleUrl = input.opportunity.article.url;
  const claims: FactClaim[] = input.review.factReview.claims.map((claim) => {
    if (claim.kind === "ARTICLE") {
      return {
        ...claim,
        supported: claim.supported && urlsEquivalent(claim.source, articleUrl),
      };
    }
    if (claim.kind === "PROFILE") {
      return {
        ...claim,
        supported: claim.supported && evidenceInCorpus(claim.source, corpus),
      };
    }
    return claim;
  });

  const unsupported = unique([
    ...input.review.factReview.unsupportedClaims,
    ...claims.filter((claim) => !claim.supported && claim.kind !== "INTERPRETATION").map((claim) => claim.claim),
  ]);

  const body = input.review.body.trim() || input.draft.body.trim();
  const hook = input.review.hook.trim() || input.draft.hook.trim();
  if (hasUnsupportedFirstPerson(body) && !claims.some((claim) => claim.kind === "PROFILE" && claim.supported)) {
    unsupported.push("First-person operational claims need profile evidence.");
  }

  const factReview: FactReview = {
    summary: input.review.factReview.summary,
    claims,
    unsupportedClaims: unsupported.slice(0, 12),
  };

  return {
    ...input.review,
    hook,
    body: ensureHookPrefix(hook, body),
    factReview,
  };
}

export function ensureHookPrefix(hook: string, body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith(hook)) {
    return trimmed;
  }
  return `${hook}\n\n${trimmed}`;
}

function hasUnsupportedFirstPerson(body: string): boolean {
  return FIRST_PERSON.test(body);
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}
