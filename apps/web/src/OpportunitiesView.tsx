import { useEffect, useState } from "react";
import { ANGLE_LABELS, type OpportunitySetPublic } from "@studio/shared";
import {
  fetchOpportunities,
  generateOpportunities,
  selectOpportunity,
  type ApiError,
} from "./api";

export function OpportunitiesView({ onContinue }: { onContinue: () => void }) {
  const [set, setSet] = useState<OpportunitySetPublic | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating" | "selecting">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOpportunities()
      .then((existing) => {
        if (!cancelled) {
          setSet(existing);
          setStatus("idle");
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled) {
          setError(err.message);
          setStatus("idle");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setError(null);
    setStatus("generating");
    try {
      setSet(await generateOpportunities());
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function select(id: string) {
    setError(null);
    setStatus("selecting");
    try {
      setSet(await selectOpportunity(id));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  if (status === "loading") {
    return <p className="empty">Loading opportunities…</p>;
  }

  return (
    <div>
      <p className="lede">
        Each card answers why this professional should discuss this event. Weak matches are
        rejected. You must choose an angle before a post is written.
      </p>
      {error ? <div className="error">{error}</div> : null}

      {status === "generating" ? (
        <p className="empty">Judging which events you can credibly discuss…</p>
      ) : null}

      {set && status !== "generating" && set.opportunities.length > 0 ? (
        <div className="article-list">
          {set.opportunities.map((opportunity) => (
            <article
              className={opportunity.selected ? "article-card selected" : "article-card"}
              key={opportunity.id}
            >
              <p className="eyebrow">
                {opportunity.article.source} · match {opportunity.matchScore}% ·{" "}
                {ANGLE_LABELS[opportunity.payload.angle]}
              </p>
              <h3>{opportunity.payload.topic}</h3>
              <p>
                <a href={opportunity.article.url} target="_blank" rel="noreferrer">
                  {opportunity.article.title}
                </a>
              </p>
              <p>
                <strong>Why this fits you.</strong> {opportunity.payload.whyItFits}
              </p>
              <p>
                <strong>Why your audience may care.</strong> {opportunity.payload.audienceCare}
              </p>
              <p>
                <strong>Thesis.</strong> {opportunity.payload.thesis}
              </p>
              <p>
                <strong>Evidence.</strong> {opportunity.payload.evidence.join(" · ")}
              </p>
              <p>
                <strong>Credibility risk.</strong> {opportunity.payload.credibilityRisk}
              </p>
              <button
                className="btn primary"
                type="button"
                disabled={status === "selecting"}
                onClick={() => void select(opportunity.id)}
              >
                {opportunity.selected ? "Selected angle" : "Choose this angle"}
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {status === "idle" && set?.emptyReason === "NO_RELEVANT_TOPICS" ? (
        <p className="empty">
          None of the current events earned a credible angle. Discover different topics or add
          stronger evidence to the profile.
        </p>
      ) : null}

      {status === "idle" && !set ? (
        <p className="empty">No opportunities yet. Generate them from the discovered events.</p>
      ) : null}

      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={status === "generating"}
          onClick={() => void generate()}
        >
          {set ? "Regenerate opportunities" : "Generate opportunities"}
        </button>
        {set?.selectedOpportunityId ? (
          <button className="btn ghost" type="button" onClick={onContinue}>
            Continue to write
          </button>
        ) : null}
      </div>
    </div>
  );
}
