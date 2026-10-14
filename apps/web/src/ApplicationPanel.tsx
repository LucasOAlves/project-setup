import { useEffect, useRef, useState } from "react";
import type {
  ApplicationAnswersContent,
  ApplicationDocumentPublic,
  ApplicationPublic,
  ApplicationState,
  FieldPlan,
  FieldPlanSource,
} from "@studio/shared";
import {
  applicationPreviewUrl,
  documentFileUrl,
  fetchApplication,
  fetchJobDocuments,
  prepareApplication,
  rejectApplication,
  saveApplicationAnswers,
  type ApiError,
} from "./api";

const STATE_LABELS: Record<ApplicationState, string> = {
  PREPARING: "Preparing",
  NEEDS_INFORMATION: "Needs your answers",
  READY_FOR_REVIEW: "Ready for your review",
  BLOCKED_BY_PLATFORM: "Blocked by the portal",
  FAILED: "Failed",
  USER_REJECTED: "Not applying",
};

const SOURCE_LABELS: Record<FieldPlanSource, string> = {
  YOUR_DETAILS: "your details",
  YOUR_PROFILE: "your profile",
  PREPARED_ANSWER: "prepared answer",
  SAVED_ANSWER: "your answer",
  CV: "CV",
  COVER_LETTER: "cover letter",
};

const POLL_MS = 2_500;

function isConsent(field: FieldPlan): boolean {
  return field.kind === "CHECKBOX" && field.options.length === 0;
}

// The application for one job (Milestone 3): prepare it in a private browser, answer what your
// details do not cover, and review the filled form. Nothing is ever submitted from here.
export function ApplicationPanel({ jobId, jobUrl }: { jobId: string; jobUrl: string }) {
  const [application, setApplication] = useState<ApplicationPublic | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState<string[]>([]);
  const timer = useRef<number | null>(null);

  async function reload() {
    const next = await fetchApplication(jobId);
    setApplication(next);
    setLoaded(true);
    return next;
  }

  useEffect(() => {
    reload().catch((caught: ApiError) => setError(caught.message));
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // While the browser worker runs, check back until the run settles.
  useEffect(() => {
    if (application?.status !== "PREPARING") {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      return;
    }
    if (timer.current) return;
    timer.current = window.setInterval(() => {
      reload().catch((caught: ApiError) => setError(caught.message));
    }, POLL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application?.status]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const prepare = () => act(() => prepareApplication(jobId));
  const questions = (application?.plan ?? []).filter((field) => field.status === "NEEDS_INPUT");
  const answered = questions.filter((field) => (isConsent(field) ? agreed.includes(field.questionKey) : (drafts[field.questionKey] ?? "").trim()));

  const saveAndPrepare = () =>
    act(async () => {
      if (!application) return;
      await saveApplicationAnswers(application.id, {
        answers: questions
          .filter((field) => !isConsent(field) && (drafts[field.questionKey] ?? "").trim())
          .map((field) => ({ questionKey: field.questionKey, answer: drafts[field.questionKey]!.trim() })),
        agreed,
      });
      setDrafts({});
      await prepareApplication(jobId);
    });

  if (!loaded) return <div className="materials">{error ? <div className="error">{error}</div> : <p className="status">Loading…</p>}</div>;

  const settled = application && application.status !== "PREPARING";
  const lastEvent = application?.events.at(-1);

  return (
    <div className="materials" data-testid="application-panel">
      <p className="status">
        Opens the posting in a private browser, fills what your details answer, and stops before submitting. Nothing is sent to
        the company.
      </p>
      {error ? <div className="error">{error}</div> : null}

      {!application ? (
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void prepare()}>
            {busy ? "Starting…" : "Prepare application"}
          </button>
        </div>
      ) : (
        <>
          <div className="tags">
            <span className={`tag application-${application.status.toLowerCase()}`} data-testid="application-status">
              {application.mode === "MANUAL" && application.status === "READY_FOR_REVIEW" ? "Apply by hand" : STATE_LABELS[application.status]}
            </span>
            {application.portal ? <span className="tag">{application.portal}</span> : <span className="tag">manual</span>}
          </div>
          {lastEvent ? <p>{lastEvent.reason}</p> : null}
          {application.status === "PREPARING" ? <p className="status">Filling the form in a private browser…</p> : null}

          {application.mode === "MANUAL" || application.status === "BLOCKED_BY_PLATFORM" ? (
            <ManualFallback jobId={jobId} jobUrl={application.destinationUrl || jobUrl} />
          ) : null}

          {settled && questions.length > 0 ? (
            <section className="materials-section" data-testid="application-questions">
              <h4>Questions only you can answer</h4>
              {questions.map((field) => (
                <QuestionInput
                  key={field.key}
                  field={field}
                  value={drafts[field.questionKey] ?? ""}
                  agreed={agreed.includes(field.questionKey)}
                  onChange={(value) => setDrafts({ ...drafts, [field.questionKey]: value })}
                  onAgree={(yes) =>
                    setAgreed(yes ? [...agreed, field.questionKey] : agreed.filter((key) => key !== field.questionKey))
                  }
                />
              ))}
              <p className="status">Answers are saved and reused when another form asks the same question. Consent applies to this application only.</p>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn" type="button" disabled={busy || answered.length === 0} onClick={() => void saveAndPrepare()}>
                  {busy ? "Saving…" : "Save answers and prepare again"}
                </button>
              </div>
            </section>
          ) : null}

          {settled && application.plan ? <FieldList plan={application.plan} /> : null}

          {settled && application.preview ? (
            <section className="materials-section" data-testid="application-preview">
              <h4>Preview</h4>
              <p className="status">
                {application.preview.confirmed} fields confirmed on the page
                {application.preview.unverified.length > 0 ? `, ${application.preview.unverified.length} could not be checked` : ""}
                {application.preview.blockedRequests > 0 ? `, ${application.preview.blockedRequests} requests blocked by the guard` : ""}. Captured{" "}
                {new Date(application.preview.capturedAt).toLocaleString()}.
              </p>
              {application.preview.hasScreenshot ? (
                <details>
                  <summary>Screenshot of the filled form (your details are masked)</summary>
                  <a href={applicationPreviewUrl(application)} target="_blank" rel="noreferrer">
                    <img className="application-screenshot" src={applicationPreviewUrl(application)} alt="The filled application form, with typed values masked" />
                  </a>
                </details>
              ) : (
                <p className="status">The screenshot was removed after 30 days.</p>
              )}
            </section>
          ) : null}

          {settled ? (
            <div className="actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void prepare()}>
                Prepare again
              </button>
              {application.status !== "USER_REJECTED" ? (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(() => rejectApplication(application.id))}>
                  Not applying
                </button>
              ) : null}
            </div>
          ) : null}

          <details>
            <summary>History ({application.events.length})</summary>
            <ul>
              {application.events.map((event) => (
                <li key={event.id}>
                  {new Date(event.createdAt).toLocaleString()} · {STATE_LABELS[event.toStatus]} · {event.actor.toLowerCase()} · {event.reason}
                </li>
              ))}
            </ul>
          </details>
          <p className="status">Submitting, after your explicit approval, comes in the next milestone. Nothing was submitted.</p>
        </>
      )}
    </div>
  );
}

function QuestionInput({
  field,
  value,
  agreed,
  onChange,
  onAgree,
}: {
  field: FieldPlan;
  value: string;
  agreed: boolean;
  onChange: (value: string) => void;
  onAgree: (yes: boolean) => void;
}) {
  if (isConsent(field)) {
    return (
      <label className="field" data-testid={`question-${field.key}`}>
        <span>
          <input type="checkbox" checked={agreed} onChange={(event) => onAgree(event.target.checked)} /> {field.label}
        </span>
        {field.note ? <span className="status">{field.note}</span> : null}
      </label>
    );
  }
  return (
    <label className="field" data-testid={`question-${field.key}`}>
      {field.label}
      {field.options.length > 0 && field.kind !== "CHECKBOX" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.kind === "TEXTAREA" ? (
        <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {field.note ? <span className="status">{field.note}</span> : null}
    </label>
  );
}

function FieldList({ plan }: { plan: FieldPlan[] }) {
  return (
    <details>
      <summary>Every field on the form ({plan.length})</summary>
      <ul className="application-fields">
        {plan.map((field) => (
          <li key={field.key}>
            <span className={`tag answer-${field.status === "FILLED" ? "from_profile" : field.status === "NEEDS_INPUT" ? "needs_input" : "left_empty"}`}>
              {field.status === "FILLED" ? "Filled" : field.status === "NEEDS_INPUT" ? "Needs you" : "Left empty"}
            </span>{" "}
            <strong>{field.label}</strong>
            {field.required ? " *" : ""}
            {field.value ? `: ${field.value}` : ""}
            {field.source ? <span className="status"> ({SOURCE_LABELS[field.source]})</span> : null}
            {field.note ? <div className="status">{field.note}</div> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

// For portals the browser does not fill, or that blocked it: everything prepared, to use by hand.
function ManualFallback({ jobId, jobUrl }: { jobId: string; jobUrl: string }) {
  const [documents, setDocuments] = useState<ApplicationDocumentPublic[] | null>(null);
  useEffect(() => {
    fetchJobDocuments(jobId)
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [jobId]);
  const latest = (type: ApplicationDocumentPublic["type"]) =>
    (documents ?? []).filter((document) => document.type === type).sort((a, b) => b.version - a.version)[0];
  const cv = latest("CV");
  const letter = latest("COVER_LETTER");
  const answers = latest("APPLICATION_ANSWERS")?.content as ApplicationAnswersContent | undefined;

  return (
    <section className="materials-section" data-testid="manual-fallback">
      <h4>Apply by hand</h4>
      <p className="status">Open the posting and use what is prepared here. Copy each answer into the form yourself.</p>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        {jobUrl ? (
          <a className="btn ghost" href={jobUrl} target="_blank" rel="noreferrer">
            Open the posting
          </a>
        ) : null}
        {cv?.hasFile ? (
          <a className="btn ghost" href={documentFileUrl(cv.id)}>
            Download CV v{cv.version}
          </a>
        ) : null}
        {letter?.hasFile ? (
          <a className="btn ghost" href={documentFileUrl(letter.id)}>
            Download cover letter v{letter.version}
          </a>
        ) : null}
      </div>
      {documents && !cv ? <p className="status">No CV yet. Generate one in Materials.</p> : null}
      {answers ? (
        <ul>
          {answers.answers
            .filter((answer) => answer.answer.trim())
            .map((answer) => (
              <li key={answer.id}>
                <strong>{answer.question}</strong> {answer.answer}{" "}
                <button className="btn ghost" type="button" onClick={() => void navigator.clipboard?.writeText(answer.answer)}>
                  Copy
                </button>
              </li>
            ))}
        </ul>
      ) : documents ? (
        <p className="status">Prepare answers in Materials to have them ready to copy.</p>
      ) : null}
    </section>
  );
}
