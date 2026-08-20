import assert from "node:assert/strict";
import test from "node:test";
import { profileInputSchema, type OpportunityPublic } from "@studio/shared";
import {
  evidenceInCorpus,
  groundReviewedPost,
  profileEvidenceCorpus,
  urlsEquivalent,
} from "./ground-post.ts";

const profile = () => ({
  ...profileInputSchema.parse({
    headline: "Staff Platform Engineer",
    currentJobTitle: "Staff Engineer",
    currentCompany: "Nimbus",
    topSkills: ["Kubernetes"],
    experiences: [
      {
        role: "Staff Engineer",
        company: "Nimbus",
        achievements: "Ran the internal Kubernetes platform",
      },
    ],
  }),
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  evidenceWarning: null,
  photos: [],
  experiences: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "Staff Engineer",
      company: "Nimbus",
      startPeriod: "",
      endPeriod: "",
      description: "",
      responsibilities: "",
      achievements: "Ran the internal Kubernetes platform",
      technologies: ["Kubernetes"],
      measurableOutcomes: "",
    },
  ],
  writingSamples: [],
});

const opportunity = (): OpportunityPublic => ({
  id: "11111111-1111-4111-8111-111111111111",
  matchScore: 80,
  selected: true,
  article: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Kubernetes 1.32 released",
    description: "Scheduler changes",
    source: "Kubernetes",
    url: "https://kubernetes.io/blog/1-32",
    publishedAt: new Date().toISOString(),
    topics: ["Kubernetes"],
  },
  payload: {
    topic: "Kubernetes 1.32",
    sourceEvent: "Kubernetes 1.32 released",
    whyItMatters: "Upgrades",
    whyItFits: "Platform work at Nimbus",
    audienceCare: "Platform leads",
    targetAudience: "Platform engineers",
    thesis: "Watch the scheduler contract",
    pointOfView: "Upgrade with an operational contract",
    storytellingDirection: "Event to production",
    readerTakeaway: "Measure the contract",
    credibilityRisk: "Do not invent cluster counts",
    evidence: ["Staff Engineer at Nimbus"],
    angle: "PRODUCTION_REALITY",
  },
});

const draft = {
  storyStrategy: {
    structure: "Event to production",
    hookApproach: "Specific operational tension",
    narrativeArc: "News then implication",
    evidenceToUse: ["Staff Engineer at Nimbus"],
    claimsToAvoid: ["Cluster counts"],
    takeaway: "Measure the contract",
  },
  hook: "The Kubernetes 1.32 notes are not the interesting part.",
  body: "The Kubernetes 1.32 notes are not the interesting part.\n\nScheduler changes will hit platform teams first.",
};

test("marks article claims with the wrong URL as unsupported", () => {
  const grounded = groundReviewedPost({
    draft,
    review: {
      hook: draft.hook,
      body: draft.body,
      writingReview: { summary: "Fine", revisedSections: [], remainingRisks: [] },
      factReview: {
        summary: "Checked",
        claims: [
          {
            claim: "Kubernetes 1.32 released",
            kind: "ARTICLE",
            source: "https://example.com/unrelated",
            supported: true,
          },
        ],
        unsupportedClaims: [],
      },
      seoReview: { summary: "Natural", keywordsUsed: ["Kubernetes"], stuffingRisk: "Low" },
      quality: { score: 70, explanation: "Specific", strengths: ["Concrete"], improvements: [] },
    },
    profile: profile(),
    opportunity: opportunity(),
  });

  assert.equal(grounded.factReview.claims[0]?.supported, false);
  assert.ok(grounded.factReview.unsupportedClaims.includes("Kubernetes 1.32 released"));
});

test("rejects profile claims that are not in the saved evidence", () => {
  const grounded = groundReviewedPost({
    draft,
    review: {
      hook: "I scaled a 400-cluster fleet last year.",
      body: "I scaled a 400-cluster fleet last year.",
      writingReview: { summary: "Too much swagger", revisedSections: ["hook"], remainingRisks: [] },
      factReview: {
        summary: "Personal claim",
        claims: [
          {
            claim: "Scaled a 400-cluster fleet",
            kind: "PROFILE",
            source: "400-cluster fleet",
            supported: true,
          },
        ],
        unsupportedClaims: [],
      },
      seoReview: { summary: "Fine", keywordsUsed: [], stuffingRisk: "Low" },
      quality: { score: 40, explanation: "Unsupported", strengths: [], improvements: ["Evidence"] },
    },
    profile: profile(),
    opportunity: opportunity(),
  });

  assert.equal(grounded.factReview.claims[0]?.supported, false);
  assert.ok(grounded.factReview.unsupportedClaims.length > 0);
});

test("matches profile evidence tokens and official article URLs", () => {
  const corpus = profileEvidenceCorpus(profile());
  assert.equal(evidenceInCorpus("Nimbus Kubernetes platform", corpus), true);
  assert.equal(urlsEquivalent("https://www.kubernetes.io/blog/1-32/", "https://kubernetes.io/blog/1-32"), true);
});
