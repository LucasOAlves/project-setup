import { useCallback, useEffect, useState } from "react";
import type {
  ExplanationClaim,
  FeedbackReason,
  FeedbackSummary,
  FeedEligibilityFilter,
  GroundedJobExplanation,
  JobFeedItem,
  JobFreshnessSignal,
  MatchDimensionName,
  EligibilityReasonPublic,
} from "@studio/shared";
import { JOB_SOURCES, MATCH_DIMENSIONS } from "@studio/shared";
import {
  evaluateJob,
  fetchFeedbackSummary,
  fetchJobFeed,
  runDiscoveryNow,
  submitJobFeedback,
  type JobFeedFilters,
} from "./api";

// Ranked job feed (Job Hunter JOB-008): every tracked or discovered job with its eligibility
// verdict, match score and, for shortlisted jobs, the evidence-checked explanation.

const ELIGIBILITY_LABELS: Record<FeedEligibilityFilter, string> = {
  ELIGIBLE: "Eligible",
  UNKNOWN: "Eligibility unknown",
  NOT_EVALUATED: "Not evaluated",
  EXCLUDED: "Excluded",
};

const EFFECT_LABELS: Record<EligibilityReasonPublic["effect"], string> = {
  EXCLUDES: "Excludes",
  CONFIRMS: "Confirms",
  SUPPORTS: "Suggests it hires abroad",
};

const DIMENSION_LABELS: Record<MatchDimensionName, string> = {
  technical: "Technical stack",
  seniority: "Seniority and responsibilities",
  experience: "Experience and achievements",
  geography: "Location and contract",
  compensation: "Compensation",
  preferences: "Other preferences",
};

const FLAG_LABELS: Record<string, string> = {
  STACK_UNKNOWN: "Stack not stated",
  SENIORITY_UNKNOWN: "Seniority not stated",
  ELIGIBILITY_UNKNOWN: "Eligibility not confirmed",
  COMPENSATION_UNDISCLOSED: "Pay not disclosed",
  COMPENSATION_BELOW_TARGET: "Pay below target",
  COMPENSATION_APPROXIMATE: "Pay converted (approximate)",
};

// Freshness and trust signals: warnings first, then the good signs.
const SIGNAL_LABELS: Record<JobFreshnessSignal, string> = {
  NO_POSTED_DATE: "No posting date",
  STALE: "Posted over 30 days ago",
  LIKELY_GHOST: "Likely ghost job (60+ days)",
  SALARY_PUBLISHED: "Salary published",
  COMPANY_SITE: "On the company's site",
};

const ACTION_LABELS: Record<GroundedJobExplanation["recommendedAction"], string> = {
  APPLY: "Apply",
  CONSIDER: "Consider",
  SKIP: "Skip",
};

const EXPLANATION_SECTIONS: Array<[keyof GroundedJobExplanation, string]> = [
  ["whyShortlisted", "Why it was shortlisted"],
  ["matchedRequirements", "Requirements you meet"],
  ["gaps", "Missing or unverified"],
  ["geographicEligibility", "Location eligibility"],
  ["compensation", "Compensation"],
  ["technicalRelevance", "Technical and career relevance"],
  ["applicationRisks", "Application risks"],
];

const REASON_LABELS: Record<FeedbackReason, string> = {
  GREAT_MATCH: "Great match",
  WRONG_STACK: "Wrong stack",
  WRONG_SENIORITY: "Wrong seniority",
  PAY_TOO_LOW: "Pay too low",
  LOCATION: "Location",
  ROLE_TYPE: "Not my kind of role",
  COMPANY: "Company",
  OTHER: "Other",
};

const RELEVANT_REASONS: FeedbackReason[] = ["GREAT_MATCH", "OTHER"];
const NOT_RELEVANT_REASONS: FeedbackReason[] = [
  "WRONG_STACK",
  "WRONG_SENIORITY",
  "PAY_TOO_LOW",
  "LOCATION",
  "ROLE_TYPE",
  "COMPANY",
  "OTHER",
];

type Verdict = "RELEVANT" | "NOT_RELEVANT";

const DEFAULT_FILTERS: JobFeedFilters = {
  eligibility: ["ELIGIBLE", "UNKNOWN", "NOT_EVALUATED"],
  minScore: 0,
  source: "",
  q: "",
  postedWithinDays: null,
};

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function JobFeedView() {
  const [filters, setFilters] = useState<JobFeedFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<JobFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);

  const load = useCallback(async (next: JobFeedFilters) => {
    setLoading(true);
    setError(null);
    try {
      const [feed, feedbackSummary] = await Promise.all([fetchJobFeed(next), fetchFeedbackSummary()]);
      setItems(feed);
      setSummary(feedbackSummary);
    } catch (caught) {
      setError((caught as { message?: string }).message ?? "The job feed could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  function toggleEligibility(value: FeedEligibilityFilter) {
    setFilters((current) => {
      const has = current.eligibility.includes(value);
      const eligibility = has
        ? current.eligibility.filter((item) => item !== value)
        : [...current.eligibility, value];
      return eligibility.length === 0 ? current : { ...current, eligibility };
    });
  }

  async function handleEvaluate(id: string) {
    setEvaluatingId(id);
    setError(null);
    try {
      await evaluateJob(id);
      await load(filters);
      setOpenId(id);
    } catch (caught) {
      setError((caught as { message?: string }).message ?? "The job could not be evaluated.");
    } finally {
      setEvaluatingId(null);
    }
  }

  async function handleFeedback(item: JobFeedItem, verdict: Verdict, reasons: FeedbackReason[]) {
    if (!item.evaluation) return;
    setError(null);
    try {
      const feedback = await submitJobFeedback(item.job.id, {
        evaluationId: item.evaluation.id,
        verdict,
        reasons,
        note: "",
      });
      setItems((current) =>
        current.map((entry) => (entry.job.id === item.job.id ? { ...entry, feedback } : entry)),
      );
      setSummary(await fetchFeedbackSummary());
    } catch (caught) {
      setError((caught as { message?: string }).message ?? "The feedback could not be saved.");
    }
  }

  async function handleRunDiscovery() {
    setDiscovering(true);
    setError(null);
    try {
      const results = await runDiscoveryNow();
      const queued = results.filter((result) => result.status === "QUEUED").map((result) => result.sourceId);
      setNotice(
        queued.length > 0
          ? `Discovery queued for ${queued.join(", ")}. New jobs appear here as the worker imports and scores them.`
          : "Discovery already ran today for every source.",
      );
    } catch (caught) {
      setError((caught as { message?: string }).message ?? "Discovery could not be started.");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div>
      <p className="lede">
        Jobs from daily discovery and your tracker, ranked by match score. Excluded jobs stay
        hidden unless you ask for them, and every explanation quotes the posting or your profile.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <section className="article-card">
        <div className="pills" role="group" aria-label="Eligibility">
          {(Object.keys(ELIGIBILITY_LABELS) as FeedEligibilityFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`pill${filters.eligibility.includes(value) ? " selected" : ""}`}
              aria-pressed={filters.eligibility.includes(value)}
              onClick={() => toggleEligibility(value)}
            >
              {ELIGIBILITY_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <label className="field">
            Search title or company
            <input
              value={filters.q}
              placeholder="e.g. backend"
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </label>
          <label className="field">
            Minimum match score
            <select
              value={filters.minScore}
              onChange={(event) => setFilters({ ...filters, minScore: Number(event.target.value) })}
            >
              <option value={0}>Any</option>
              {[50, 60, 70, 80].map((value) => (
                <option key={value} value={value}>
                  {value}+
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Source
            <select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
              <option value="">All sources</option>
              {JOB_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Posted within
            <select
              value={filters.postedWithinDays ?? ""}
              onChange={(event) =>
                setFilters({ ...filters, postedWithinDays: event.target.value ? Number(event.target.value) : null })
              }
            >
              <option value="">Any time</option>
              {[7, 14, 30].map((value) => (
                <option key={value} value={value}>
                  {value} days
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn ghost" type="button" disabled={discovering} onClick={handleRunDiscovery}>
            {discovering ? "Starting…" : "Run discovery now"}
          </button>
        </div>
      </section>

      {summary && summary.rated > 0 ? <CalibrationSummary summary={summary} /> : null}

      {loading ? <p className="empty">Loading jobs…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="empty">No jobs match these filters yet.</p>
      ) : null}

      <div className="article-list">
        {items.map((item) => (
          <FeedCard
          key={item.job.id}
          item={item}
          open={openId === item.job.id}
          evaluating={evaluatingId === item.job.id}
          onToggle={() => setOpenId(openId === item.job.id ? null : item.job.id)}
          onEvaluate={() => void handleEvaluate(item.job.id)}
            onFeedback={(verdict, reasons) => void handleFeedback(item, verdict, reasons)}
          />
        ))}
      </div>
    </div>
  );
}

function FeedCard({
  item,
  open,
  evaluating,
  onToggle,
  onEvaluate,
  onFeedback,
}: {
  item: JobFeedItem;
  open: boolean;
  evaluating: boolean;
  onToggle: () => void;
  onEvaluate: () => void;
  onFeedback: (verdict: Verdict, reasons: FeedbackReason[]) => void;
}) {
  const { job, evaluation, explanation, feedback } = item;
  // Feedback is tied to one evaluation: after a re-evaluation the earlier verdict no longer applies.
  const current = feedback && evaluation && feedback.evaluationId === evaluation.id ? feedback : null;
  const eligibility: FeedEligibilityFilter = evaluation?.eligibility ?? "NOT_EVALUATED";

  return (
    <article className="article-card" data-testid="feed-card">
      <p className="eyebrow">
        {[item.companyName, job.location, `via ${job.source}`, `posted ${daysAgo(item.postedAt)}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <h3>{job.url ? <a href={job.url} target="_blank" rel="noreferrer">{job.title}</a> : job.title}</h3>
      <div className="tags">
        <span className="tag">{ELIGIBILITY_LABELS[eligibility]}</span>
        {evaluation?.score !== null && evaluation?.score !== undefined ? (
          <span className="tag">
            <strong>Match {evaluation.score}/100</strong> · confidence {evaluation.confidence}%
          </span>
        ) : null}
        {explanation ? <span className="tag">{ACTION_LABELS[explanation.recommendedAction]}</span> : null}
        {(item.signals ?? []).map((signal) => (
          <span className={`tag signal-${signal.toLowerCase()}`} key={signal} data-testid="feed-signal">
            {SIGNAL_LABELS[signal]}
          </span>
        ))}
        {(evaluation?.match?.flags ?? []).map((flag) => (
          <span className="tag" key={flag}>
            {FLAG_LABELS[flag] ?? flag}
          </span>
        ))}
      </div>
      {explanation ? <p>{explanation.executiveSummary}</p> : null}
      {evaluation?.match && evaluation.match.matchedSkills.length + evaluation.match.missingSkills.length > 0 ? (
        <p className="status">
          {evaluation.match.matchedSkills.length > 0 ? `Matches: ${evaluation.match.matchedSkills.join(", ")}. ` : ""}
          {evaluation.match.missingSkills.length > 0 ? `Missing: ${evaluation.match.missingSkills.join(", ")}.` : ""}
        </p>
      ) : null}

      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost" type="button" disabled={evaluating} onClick={onEvaluate}>
          {evaluating ? "Evaluating…" : evaluation ? "Re-evaluate" : "Evaluate"}
        </button>
        {evaluation ? (
          <button className="btn ghost" type="button" aria-expanded={open} onClick={onToggle}>
            {open ? "Hide details" : "Show details"}
          </button>
        ) : null}
      </div>

      {evaluation ? (
        <div className="actions" style={{ justifyContent: "flex-start" }} role="group" aria-label="Is this job relevant?">
          {(["RELEVANT", "NOT_RELEVANT"] as Verdict[]).map((verdict) => (
            <button
              key={verdict}
              type="button"
              className={`pill${current?.verdict === verdict ? " selected" : ""}`}
              aria-pressed={current?.verdict === verdict}
              onClick={() => {
                if (current?.verdict !== verdict) onFeedback(verdict, []);
              }}
            >
              {verdict === "RELEVANT" ? "Relevant" : "Not relevant"}
            </button>
          ))}
        </div>
      ) : null}
      {current ? (
        <div className="pills" role="group" aria-label="Why?" style={{ marginTop: 4 }}>
          {(current.verdict === "RELEVANT" ? RELEVANT_REASONS : NOT_RELEVANT_REASONS).map((reason) => {
            const selected = current.reasons.includes(reason);
            return (
              <button
                key={reason}
                type="button"
                className={`pill${selected ? " selected" : ""}`}
                aria-pressed={selected}
                onClick={() =>
                  onFeedback(
                    current.verdict,
                    selected ? current.reasons.filter((item) => item !== reason) : [...current.reasons, reason],
                  )
                }
              >
                {REASON_LABELS[reason]}
              </button>
            );
          })}
        </div>
      ) : null}

      {open && evaluation ? (
        <div className="notice">
          {evaluation.eligibilityReasons.length > 0 ? (
            <>
              <p>
                <strong>Eligibility rules</strong>
              </p>
              <ul>
                {evaluation.eligibilityReasons.map((reason, index) => (
                  <li key={index}>
                    {EFFECT_LABELS[reason.effect]}: “{reason.quote}”
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              <strong>Eligibility rules.</strong> Nothing in the posting confirms or rules out hiring
              from your region.
            </p>
          )}

          {evaluation.match ? (
            <>
              <p>
                <strong>Score breakdown</strong>
              </p>
              <ul>
                {MATCH_DIMENSIONS.map((key) => {
                  const dimension = evaluation.match?.dimensions[key];
                  if (!dimension) return null;
                  return (
                    <li key={key}>
                      {DIMENSION_LABELS[key]} ({Math.round(dimension.weight * 100)}%):{" "}
                      {dimension.known ? `${dimension.score}/100` : "not enough information"}
                      {dimension.notes.length > 0 ? ` · ${dimension.notes.join(" ")}` : ""}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {explanation ? (
            <ExplanationDetail explanation={explanation} explainedAt={item.explainedAt} />
          ) : evaluation.score !== null ? (
            <p className="status">No explanation yet: jobs are explained from a match score of 60.</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ExplanationDetail({
  explanation,
  explainedAt,
}: {
  explanation: GroundedJobExplanation;
  explainedAt: string | null;
}) {
  const removed = explanation.grounding.droppedClaims;
  return (
    <>
      <p>
        <strong>
          Recommendation: {ACTION_LABELS[explanation.recommendedAction]} (confidence{" "}
          {explanation.confidence.toLowerCase()})
        </strong>
      </p>
      {EXPLANATION_SECTIONS.map(([key, label]) => {
        const claims = explanation[key] as ExplanationClaim[];
        if (claims.length === 0) return null;
        return (
          <div key={key}>
            <p>
              <strong>{label}</strong>
            </p>
            <ul>
              {claims.map((claim, index) => (
                <li key={index}>
                  {claim.kind === "INFERENCE" ? <em>Inference: </em> : null}
                  {claim.statement}
                  {claim.evidence.map((evidence, quoteIndex) => (
                    <span className="status" key={quoteIndex} style={{ display: "block" }}>
                      {evidence.source === "JOB" ? "Posting" : "Your profile"}: “{evidence.quote}”
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {explanation.cvEmphasis.length > 0 ? (
        <p>
          <strong>Lead your CV with.</strong> {explanation.cvEmphasis.join(" · ")}
        </p>
      ) : null}
      {explanation.interviewTopics.length > 0 ? (
        <p>
          <strong>Likely interview topics.</strong> {explanation.interviewTopics.join(" · ")}
        </p>
      ) : null}
      <p className="status">
        {removed > 0
          ? `${removed} claim${removed === 1 ? " was" : "s were"} removed because the quoted evidence was not found in the posting or your profile. `
          : ""}
        {explainedAt ? `Explained ${daysAgo(explainedAt)}.` : ""}
      </p>
    </>
  );
}

function CalibrationSummary({ summary }: { summary: FeedbackSummary }) {
  const agreement = summary.agreementRate === null ? null : Math.round(summary.agreementRate * 100);
  const gaps = MATCH_DIMENSIONS.flatMap((key) => {
    const { relevantAverage, notRelevantAverage } = summary.dimensions[key] ?? {};
    if (relevantAverage == null || notRelevantAverage == null) return [];
    return [{ key, difference: relevantAverage - notRelevantAverage }];
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const strongest = gaps[0];

  return (
    <div className="notice">
      <p>
        <strong>Your feedback.</strong> {summary.rated} rated ({summary.relevant} relevant, {summary.notRelevant} not).
        {agreement !== null
          ? ` The match score agrees with you ${agreement}% of the time (relevant at ${summary.threshold}+, not relevant below).`
          : ""}
      </p>
      {summary.reasons.length > 0 ? (
        <p className="status">
          Most given reasons:{" "}
          {summary.reasons
            .slice(0, 3)
            .map((entry) => `${REASON_LABELS[entry.reason]} (${entry.count})`)
            .join(", ")}
          .
        </p>
      ) : null}
      {/* Too few verdicts on either side say nothing about the weights. */}
      {strongest && Math.abs(strongest.difference) >= 10 && summary.relevant >= 5 && summary.notRelevant >= 5 ? (
        <p className="status">
          {DIMENSION_LABELS[strongest.key]} separates relevant from not relevant jobs the most (
          {strongest.difference > 0 ? "+" : ""}
          {strongest.difference} points), so it may deserve more weight.
        </p>
      ) : null}
    </div>
  );
}

