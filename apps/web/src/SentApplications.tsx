import { useEffect, useState } from "react";
import type { RecruiterMessagePublic, SentApplication } from "@studio/shared";
import { answerSuggestion, fetchSentApplications, pasteRecruiterMessage, type ApiError } from "./api";

// Sent applications and what came back (Milestone 5). A reply only suggests a pursuit status;
// you accept or dismiss it, and the app never writes to anyone.

const CLASS_LABELS: Record<string, string> = {
  APPLICATION_RECEIVED: "Application received",
  REJECTION: "Rejection",
  INTERVIEW_REQUEST: "Interview request",
  ASSESSMENT: "Assessment",
  OFFER: "Offer",
  RECRUITER_OUTREACH: "Recruiter outreach",
  OTHER: "Other",
  UNCLEAR: "Unclear: read it yourself",
  "": "Not classified",
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

export function SentApplications() {
  const [items, setItems] = useState<SentApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setItems(await fetchSentApplications());
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (!items) return error ? <div className="error">{error}</div> : null;
  return (
    <section className="article-card" data-testid="sent-applications">
      <h3>Sent applications</h3>
      <p className="status">
        Replies read from Gmail or pasted here. A reply can suggest a new status for the job: nothing changes until you accept it.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {items.length === 0 ? <p className="status">No application has been sent yet.</p> : null}
      {items.map((item) => (
        <SentItem key={item.applicationId} item={item} onChange={() => void reload()} onError={setError} />
      ))}
    </section>
  );
}

function SentItem({ item, onChange, onError }: { item: SentApplication; onChange: () => void; onError: (message: string) => void }) {
  const [pasting, setPasting] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function paste() {
    setBusy(true);
    try {
      await pasteRecruiterMessage(item.applicationId, { subject, body });
      setPasting(false);
      setSubject("");
      setBody("");
      onChange();
    } catch (caught) {
      onError((caught as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sent-item" data-testid="sent-item" style={{ borderTop: "1px solid var(--border, #ddd)", paddingTop: 12, marginTop: 12 }}>
      <strong>{item.job.title}</strong> <span className="status">at {item.job.company}</span>
      <div className="tags">
        <span className="tag">Job: {item.job.status}</span>
        <span className="tag">Sent {new Date(item.submittedAt).toLocaleDateString()}</span>
        {item.applicationStatus === "SUBMISSION_UNKNOWN" ? <span className="tag">Result unknown</span> : null}
        {item.followUp.due ? (
          <span className="tag" data-testid="follow-up-due">
            Consider following up: {item.followUp.waitingDays} days, no reply
          </span>
        ) : null}
      </div>
      {item.messages.length === 0 ? <p className="status">No reply yet.</p> : null}
      {item.messages.map((message) => (
        <Message key={message.id} message={message} onChange={onChange} onError={onError} />
      ))}
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost" type="button" onClick={() => setPasting(!pasting)}>
          {pasting ? "Cancel" : "Paste a reply"}
        </button>
      </div>
      {pasting ? (
        <div>
          <label className="field">
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="field">
            Message
            <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn" type="button" disabled={busy || !body.trim()} onClick={() => void paste()}>
              Save reply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Message({ message, onChange, onError }: { message: RecruiterMessagePublic; onChange: () => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [showBody, setShowBody] = useState(false);

  async function answer(choice: "accept" | "dismiss") {
    setBusy(true);
    try {
      await answerSuggestion(message.id, choice);
      onChange();
    } catch (caught) {
      onError((caught as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const suggestion = STATUS_LABELS[message.suggestedStatus] ?? message.suggestedStatus;
  return (
    <div className="recruiter-message" data-testid="recruiter-message" style={{ margin: "8px 0" }}>
      <div>
        <span className="tag">{CLASS_LABELS[message.classification] ?? message.classification}</span>{" "}
        {message.subject || "(no subject)"}{" "}
        <span className="status">
          {message.senderDomain ? `from ${message.senderDomain}, ` : ""}
          {message.receivedAt ? new Date(message.receivedAt).toLocaleString() : ""}
        </span>
      </div>
      {message.evidence ? <blockquote className="status">“{message.evidence}”</blockquote> : null}
      {message.matchConfidence === "LOW" ? <p className="status">Matched to this application with low confidence: {message.matchReason}.</p> : null}
      {message.suggestedStatus && !message.decision ? (
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <span>Suggested: move the job to {suggestion}.</span>
          <button className="btn" type="button" disabled={busy} onClick={() => void answer("accept")}>
            Accept
          </button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void answer("dismiss")}>
            Dismiss
          </button>
        </div>
      ) : null}
      {message.decision ? (
        <p className="status">
          {message.decision === "ACCEPTED" ? `You moved the job to ${suggestion}.` : `You dismissed the suggestion (${suggestion}).`}
        </p>
      ) : null}
      {message.body ? (
        <button className="btn ghost" type="button" onClick={() => setShowBody(!showBody)}>
          {showBody ? "Hide message" : "Show message"}
        </button>
      ) : null}
      {showBody && message.body ? <pre style={{ whiteSpace: "pre-wrap" }}>{message.body}</pre> : null}
    </div>
  );
}
