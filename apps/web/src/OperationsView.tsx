import { useEffect, useState } from "react";
import type { AuditEventPublic, FunnelGroup, OperationsReport } from "@studio/shared";
import { fetchAuditEvents, fetchOperationsReport, type ApiError } from "./api";

// The Operations step (Milestone 5): where applications convert, what the models cost, and a
// readable audit history. Weight suggestions are shown here and never applied.

const STAGE_LABELS: Record<string, string> = {
  DISCOVERED: "Discovered",
  SHORTLISTED: "Shortlisted",
  APPLIED: "Applied",
  RESPONDED: "Got a reply",
  INTERVIEW: "Interview",
  OFFER: "Offer",
};

const ACTOR_LABELS: Record<string, string> = { USER: "You", WORKER: "Worker", SYSTEM: "System" };

const rate = (value: number | null) => (value === null ? "-" : `${Math.round(value * 100)}%`);
const usd = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

export function OperationsView() {
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationsReport()
      .then(setReport)
      .catch((caught: ApiError) => setError(caught.message));
  }, []);

  return (
    <div data-testid="operations-view">
      <p className="lede">How jobs move from discovery to an offer, which sources, scores and portals lead to replies, and what the AI costs.</p>
      {error ? <div className="error">{error}</div> : null}
      {report ? (
        <>
          <section className="article-card" data-testid="operations-funnel">
            <h3>Funnel</h3>
            <table className="doc-table">
              <tbody>
                {report.funnel.map((stage) => (
                  <tr key={stage.stage}>
                    <th>{STAGE_LABELS[stage.stage] ?? stage.stage}</th>
                    <td>{stage.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="status">
              Median time to a first reply:{" "}
              {report.medianDaysToFirstReply === null ? "no replies yet" : `${report.medianDaysToFirstReply} days`}.
            </p>
          </section>
          <Conversion title="By source" groups={report.bySource} />
          <Conversion title="By score" groups={report.byScoreBand} />
          <Conversion title="By portal" groups={report.byPortal} />
          <section className="article-card" data-testid="operations-weights">
            <h3>Matching weights</h3>
            {report.suggestions.length === 0 ? (
              <p className="status">Nothing to suggest yet: replies by score and your relevance feedback agree with the weights, or there is too little data.</p>
            ) : (
              <ul>
                {report.suggestions.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            )}
            <p className="status">Suggestions only: the weights change when you change them.</p>
          </section>
          <section className="article-card" data-testid="operations-costs">
            <h3>AI cost</h3>
            <p>
              This month: <strong>{usd(report.budget.spentUsd)}</strong>
              {report.budget.budgetUsd > 0 ? ` of ${usd(report.budget.budgetUsd)} (${report.budget.state === "REACHED" ? "budget reached" : report.budget.state === "WARNING" ? "over 80%" : "within budget"})` : ", no budget set"}.
            </p>
            {report.costs.length === 0 ? (
              <p className="status">No model calls recorded yet.</p>
            ) : (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Purpose</th>
                    <th>Calls</th>
                    <th>Estimated cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.costs.map((row) => (
                    <tr key={`${row.month}.${row.purpose}`}>
                      <td>{row.month}</td>
                      <td>{row.purpose}</td>
                      <td>{row.calls}</td>
                      <td>{usd(row.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="status">Estimates from list prices. Your provider's invoice is the real figure.</p>
          </section>
        </>
      ) : null}
      <AuditHistory />
    </div>
  );
}

function Conversion({ title, groups }: { title: string; groups: FunnelGroup[] }) {
  return (
    <section className="article-card">
      <h3>{title}</h3>
      <table className="doc-table">
        <thead>
          <tr>
            <th />
            <th>Discovered</th>
            <th>Applied</th>
            <th>Replies</th>
            <th>Reply rate</th>
            <th>Interviews</th>
            <th>Offers</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <th>{group.key}</th>
              <td>{group.discovered}</td>
              <td>{group.applied}</td>
              <td>{group.responded}</td>
              <td>{rate(group.responseRate)}</td>
              <td>{group.interview}</td>
              <td>{group.offer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function humanize(eventType: string): string {
  const words = eventType.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function details(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

function AuditHistory() {
  const [events, setEvents] = useState<AuditEventPublic[]>([]);
  const [actor, setActor] = useState("");
  const [eventType, setEventType] = useState("");
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(before?: string) {
    try {
      const page = await fetchAuditEvents({ actor, eventType: eventType.trim().toUpperCase().replace(/\s+/g, "_"), before });
      setEvents((current) => (before ? [...current, ...page] : page));
      setMore(page.length === 50);
      setError(null);
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  useEffect(() => {
    void load();
    // Reloads when the actor filter changes; the event type applies on Filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  return (
    <section className="article-card" data-testid="audit-history">
      <h3>Audit history</h3>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <label className="field">
          Who
          <select value={actor} onChange={(event) => setActor(event.target.value)}>
            <option value="">Anyone</option>
            <option value="USER">You</option>
            <option value="WORKER">Worker</option>
            <option value="SYSTEM">System</option>
          </select>
        </label>
        <label className="field">
          Event
          <input value={eventType} placeholder="for example SUBMISSION_FINISHED" onChange={(event) => setEventType(event.target.value)} />
        </label>
        <button className="btn ghost" type="button" onClick={() => void load()}>
          Filter
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {events.length === 0 ? <p className="status">No events.</p> : null}
      <table className="doc-table">
        <tbody>
          {events.map((event) => (
            <tr key={event.id} data-testid="audit-event">
              <td>{new Date(event.occurredAt).toLocaleString()}</td>
              <td>{ACTOR_LABELS[event.actor] ?? event.actor}</td>
              <td>
                {humanize(event.eventType)} <span className="status">({event.entityType})</span>
              </td>
              <td className="status">{details(event.payload)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more ? (
        <button className="btn ghost" type="button" onClick={() => void load(events.at(-1)?.occurredAt)}>
          Load more
        </button>
      ) : null}
    </section>
  );
}
