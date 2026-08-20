import { useEffect, useState } from "react";
import type { PersonaPublic } from "@studio/shared";
import { fetchPersona, generatePersona, type ApiError } from "./api";

export function PersonaView() {
  const [persona, setPersona] = useState<PersonaPublic | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPersona()
      .then((existing) => {
        if (!cancelled) {
          setPersona(existing);
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
      setPersona(await generatePersona());
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  if (status === "loading") {
    return <p className="empty">Loading persona…</p>;
  }

  return (
    <div>
      <p className="lede">
        This is an evidence-based reading of the saved profile, not a more impressive version of
        you. Strong topics require repeated proof. Desired positioning cannot fill gaps.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {persona?.evidenceWarning ? <div className="notice">{persona.evidenceWarning}</div> : null}
      {persona?.stale ? (
        <div className="notice">
          The profile changed after this persona was generated. Refresh it before trusting the
          authority map.
        </div>
      ) : null}

      {status === "generating" ? (
        <p className="empty">Reading your evidence and mapping authority…</p>
      ) : null}

      {persona && status !== "generating" ? <PersonaResult persona={persona} /> : null}

      {!persona && status === "idle" ? (
        <p className="empty">No persona yet. Generate one from the saved profile.</p>
      ) : null}

      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={status === "generating"}
          onClick={() => void generate()}
        >
          {persona ? "Regenerate persona" : "Generate persona"}
        </button>
      </div>
    </div>
  );
}

function PersonaResult({ persona }: { persona: PersonaPublic }) {
  const body = persona.persona;
  return (
    <div className="persona-result">
      <h3>{body.positioningStatement}</h3>
      <p className="lede">{body.careerNarrative}</p>
      <p className="eyebrow">
        {body.seniority} · {persona.model} · {persona.promptVersion}
      </p>

      <div className="grid-2">
        <Fact label="Core expertise" values={body.coreExpertise} />
        <Fact label="Supporting expertise" values={body.supportingExpertise} />
        <Fact label="Content pillars" values={body.contentPillars} />
        <Fact label="Differentiators" values={body.differentiators} />
      </div>

      <p>
        <strong>Technical depth.</strong> {body.technicalDepth}
      </p>
      <p>
        <strong>Leadership.</strong> {body.leadershipExposure}
      </p>
      <p>
        <strong>Audience.</strong> {body.targetAudience}
      </p>
      <p>
        <strong>Desired perception.</strong> {body.desiredPerception}
      </p>

      {body.proofPoints.length > 0 ? (
        <div>
          <h3>Proof points</h3>
          <ul className="promise-list">
            {body.proofPoints.map((point) => (
              <li key={point.claim}>
                <strong>{point.claim}</strong> — {point.evidence}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="bands">
        <Band title="Strong authority" tone="strong" items={body.strongAuthorityTopics} />
        <Band title="Credible" tone="credible" items={body.credibleTopics} />
        <Band title="Adjacent" tone="adjacent" items={body.adjacentTopics} />
        <Band title="Risky" tone="risky" items={body.riskyTopics} />
      </div>
    </div>
  );
}

function Fact({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="field">
      <strong>{label}</strong>
      <div className="tags">
        {values.length === 0 ? <span className="empty">None from current evidence</span> : null}
        {values.map((value) => (
          <span className="tag" key={value}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function Band({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "strong" | "credible" | "adjacent" | "risky";
  items: Array<{ topic: string; evidence: string }>;
}) {
  return (
    <section className={`band ${tone}`}>
      <strong>{title}</strong>
      {items.length === 0 ? <p className="empty">None</p> : null}
      {items.map((item) => (
        <p key={item.topic}>
          {item.topic}
          <br />
          <span className="eyebrow">{item.evidence}</span>
        </p>
      ))}
    </section>
  );
}
