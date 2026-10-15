import type { FeedbackSummary } from "@studio/shared";

// Operations metrics (Milestone 5, ticket 8; spec JOB-027, JOB-028, criterion 10). Pure: how far
// each job got, the funnel and its conversion by group, time to first reply, and suggestions for
// the matching weights. Suggestions are shown, never applied.

export type FunnelJob = {
  source: string;
  portal: string;
  score: number | null;
  // The job's current status and every status it has had.
  statuses: string[];
  submittedAt: Date | null;
  // The first reply that is not an automatic confirmation.
  firstReplyAt: Date | null;
};

export const FUNNEL_STAGES = ["DISCOVERED", "SHORTLISTED", "APPLIED", "RESPONDED", "INTERVIEW", "OFFER"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const APPLIED_OR_LATER = ["APPLIED", "RECRUITER_CONTACTED", "SCREENING", "INTERVIEW", "TECHNICAL_INTERVIEW", "FINAL_INTERVIEW", "OFFER"];
const HEARD_BACK = ["RECRUITER_CONTACTED", "SCREENING", "INTERVIEW", "TECHNICAL_INTERVIEW", "FINAL_INTERVIEW", "OFFER", "REJECTED"];
const INTERVIEWED = ["INTERVIEW", "TECHNICAL_INTERVIEW", "FINAL_INTERVIEW", "OFFER"];

const has = (job: FunnelJob, statuses: string[]) => job.statuses.some((status) => statuses.includes(status));

// The furthest stage a job reached, whatever happened after (a rejection after an interview
// still counts as an interview).
export function stageReached(job: FunnelJob): FunnelStage {
  if (has(job, ["OFFER"])) return "OFFER";
  if (has(job, INTERVIEWED)) return "INTERVIEW";
  const applied = job.submittedAt !== null || has(job, APPLIED_OR_LATER);
  if (applied && (job.firstReplyAt !== null || has(job, HEARD_BACK))) return "RESPONDED";
  if (applied) return "APPLIED";
  if (has(job, ["SHORTLISTED", "PREPARING"])) return "SHORTLISTED";
  return "DISCOVERED";
}

const rank = (stage: FunnelStage) => FUNNEL_STAGES.indexOf(stage);

export function funnel(jobs: FunnelJob[]): Array<{ stage: FunnelStage; count: number }> {
  const reached = jobs.map((job) => rank(stageReached(job)));
  return FUNNEL_STAGES.map((stage) => ({ stage, count: reached.filter((value) => value >= rank(stage)).length }));
}

export type FunnelGroup = { key: string; discovered: number; applied: number; responded: number; interview: number; offer: number; responseRate: number | null };

export function funnelBy(jobs: FunnelJob[], keyOf: (job: FunnelJob) => string): FunnelGroup[] {
  const groups = new Map<string, FunnelJob[]>();
  for (const job of jobs) groups.set(keyOf(job), [...(groups.get(keyOf(job)) ?? []), job]);
  return [...groups.entries()]
    .map(([key, members]) => {
      const stages = funnel(members);
      const count = (stage: FunnelStage) => stages.find((item) => item.stage === stage)!.count;
      const applied = count("APPLIED");
      const responded = count("RESPONDED");
      return { key, discovered: members.length, applied, responded, interview: count("INTERVIEW"), offer: count("OFFER"), responseRate: applied ? responded / applied : null };
    })
    .sort((a, b) => b.discovered - a.discovered || a.key.localeCompare(b.key));
}

export const SCORE_BANDS = ["below 60", "60-69", "70-79", "80-89", "90+"] as const;

export function scoreBand(score: number | null): string {
  if (score === null) return "unscored";
  if (score < 60) return "below 60";
  if (score < 70) return "60-69";
  if (score < 80) return "70-79";
  if (score < 90) return "80-89";
  return "90+";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function medianDaysToFirstReply(jobs: FunnelJob[]): number | null {
  const days = jobs
    .filter((job) => job.submittedAt && job.firstReplyAt)
    .map((job) => (job.firstReplyAt!.getTime() - job.submittedAt!.getTime()) / DAY_MS)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const middle = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[middle]! : (days[middle - 1]! + days[middle]!) / 2;
  return Math.round(median * 10) / 10;
}

// Below this, a reply rate or an agreement rate says nothing.
const MIN_APPLICATIONS = 5;
const MIN_RATED = 10;
const MIN_AGREEMENT = 0.7;

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

// What the outcomes and the relevance feedback say about the matching weights. Text for the
// user to weigh; the weights themselves are never changed here.
export function weightSuggestions(bands: FunnelGroup[], feedback: FeedbackSummary | null): string[] {
  const suggestions: string[] = [];
  const ranked = bands
    .filter((band) => (SCORE_BANDS as readonly string[]).includes(band.key) && band.applied >= MIN_APPLICATIONS && band.responseRate !== null)
    .sort((a, b) => SCORE_BANDS.indexOf(a.key as (typeof SCORE_BANDS)[number]) - SCORE_BANDS.indexOf(b.key as (typeof SCORE_BANDS)[number]));
  ranked.forEach((higher, index) => {
    const better = ranked.slice(0, index).filter((lower) => lower.responseRate! > higher.responseRate!).sort((a, b) => b.responseRate! - a.responseRate!)[0];
    if (!better) return;
    suggestions.push(
      `Jobs scored ${higher.key} got a reply ${percent(higher.responseRate!)} of the time, against ${better.key} at ${percent(better.responseRate!)} (${higher.applied} and ${better.applied} applications). The score is not predicting replies there: review the matching weights.`,
    );
  });

  if (feedback && feedback.rated >= MIN_RATED) {
    if (feedback.agreementRate !== null && feedback.agreementRate < MIN_AGREEMENT) {
      suggestions.push(`The score agrees with ${percent(feedback.agreementRate)} of your relevance feedback (${feedback.rated} jobs rated). Look at the reasons you gave most often.`);
    }
    for (const [dimension, averages] of Object.entries(feedback.dimensions)) {
      if (averages.relevantAverage === null || averages.notRelevantAverage === null) continue;
      if (averages.notRelevantAverage >= averages.relevantAverage) {
        suggestions.push(
          `The ${dimension} dimension scores jobs you marked not relevant as high as relevant ones (${Math.round(averages.notRelevantAverage)} against ${Math.round(averages.relevantAverage)}). Consider lowering its weight.`,
        );
      }
    }
  }
  return suggestions;
}
