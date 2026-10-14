import { useEffect, useState } from "react";
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
  approveApplication,
  withdrawApproval,
  documentFileUrl,
  fetchApplication,
  fetchJobDocuments,
  markApplicationNotSent,
  markApplicationSubmitted,
  prepareApplication,
  submitApplication,
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
  APPROVED: "Approved",
  SUBMITTING: "Submitting",
  SUBMITTED: "Submitted",
  SUBMISSION_UNKNOWN: "Result unknown",
  EXPIRED: "Posting closed",
};

// While a submission runs or its result is unclear, nothing may start over.
const SUBMISSION_LOCKED: ReadonlySet<ApplicationState> = new Set(["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN"]);

// States from which you can say you submitted it yourself (the assisted path).
const CAN_MARK_SUBMITTED: ReadonlySet<ApplicationState> = new Set([
  "READY_FOR_REVIEW",
  "APPROVED",
  "NEEDS_INFORMATION",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
]);

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

// The application for one job: prepare it in a private browser, answer what your details do not
// cover, and review the filled form (Milestone 3), then approve exactly that form (Milestone 4).
export function ApplicationPanel({ jobId, jobUrl, onChange }: { jobId: string; jobUrl: string; onChange?: (application: ApplicationPublic) => void }) {
  const [application, setApplication] = useState<ApplicationPublic | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState<string[]>([]);

  async function reload() {
    const next = await fetchApplication(jobId);
    setApplication(next);
    setLoaded(true);
    return next;
  }

  useEffect(() => {
    reload().catch((caught: ApiError) => setError(caught.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Tells the inbox when the status moves, whether by your action or by a run finishing.
  useEffect(() => {
    if (application) onChange?.(application);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application?.status]);

  // While the browser worker runs, or a submission is queued, check back until it settles.
  const running =
    application?.status === "PREPARING" ||
    application?.status === "SUBMITTING" ||
    (application?.status === "APPROVED" && application.submission.allowed);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      reload().catch((caught: ApiError) => setError(caught.message));
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, jobId]);

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
        Opens the posting in a private browser and fills what your details answer. Nothing is sent to the company unless you
        approve exactly that form.
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

          {application.mode === "MANUAL" ||
          application.status === "BLOCKED_BY_PLATFORM" ||
          (application.status === "APPROVED" && !application.submission.allowed) ? (
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

          {settled && application.plan ? <FieldList plan={application.plan} open={application.status === "READY_FOR_REVIEW"} /> : null}

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

          {application.status === "READY_FOR_REVIEW" && application.mode === "AUTOMATED" && application.payloadHash ? (
            <section className="approval">
              <p className="status">
                Approving allows exactly this form, with these values and files, to be sent to {new URL(application.destinationUrl).host}{" "}
                within 24 hours. Any change withdraws the approval.
              </p>
              <p className="status" data-testid="submission-permission">{application.submission.reason}</p>
              <button className="btn" type="button" disabled={busy} onClick={() => void act(() => approveApplication(application))}>
                Approve this application
              </button>
            </section>
          ) : null}
          {application.status === "APPROVED" && application.approval ? (
            <section className="approval">
              <p className="status">
                You approved this application on {new Date(application.approval.decidedAt).toLocaleString()}. The approval expires on{" "}
                {new Date(application.approval.expiresAt).toLocaleString()}.
              </p>
              {application.submission.allowed ? (
                <p className="status" data-testid="submission-queued">
                  The app will submit it to {new URL(application.destinationUrl).host} and check the result. If nothing happens, queue it
                  again.
                </p>
              ) : (
                <p className="status" data-testid="submission-permission">
                  {application.submission.reason} Use the materials above, then mark it as submitted.
                </p>
              )}
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                {application.submission.allowed ? (
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(() => submitApplication(application.id))}>
                    Queue the submission again
                  </button>
                ) : null}
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(() => withdrawApproval(application.id))}>
                  Withdraw approval
                </button>
              </div>
            </section>
          ) : null}

          {application.status === "SUBMITTING" ? (
            <p className="status" data-testid="submission-running">
              Submitting to {new URL(application.destinationUrl).host}… Do not submit it yourself while this runs.
            </p>
          ) : null}
          {application.status === "SUBMITTED" ? (
            <section className="approval" data-testid="submission-done">
              <p>
                Submitted{application.submittedAt ? ` on ${new Date(application.submittedAt).toLocaleString()}` : ""}.
                {application.confirmationReference ? ` The portal's reference: ${application.confirmationReference}.` : ""}
              </p>
            </section>
          ) : null}
          {application.status === "SUBMISSION_UNKNOWN" ? (
            <section className="approval" data-testid="submission-unknown">
              <p>
                The app clicked submit but could not confirm the result, so it will not try again. Check the portal or your email for a
                confirmation, then say what you found.
              </p>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn" type="button" disabled={busy} onClick={() => void act(() => markApplicationSubmitted(application.id))}>
                  It was sent
                </button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(() => markApplicationNotSent(application.id))}>
                  It was not sent
                </button>
              </div>
            </section>
          ) : null}

          {settled && !SUBMISSION_LOCKED.has(application.status) ? (
            <div className="actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => void prepare()}>
                Prepare again
              </button>
              {application.status !== "USER_REJECTED" ? (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(() => rejectApplication(application.id))}>
                  Not applying
                </button>
              ) : null}
              {CAN_MARK_SUBMITTED.has(application.status) &&
              (application.mode === "MANUAL" || !application.submission.allowed || application.status === "BLOCKED_BY_PLATFORM") ? (
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(() => markApplicationSubmitted(application.id))}>
                  I submitted it
                </button>
              ) : null}
            </div>
          ) : null}

          {application.executions.length > 0 ? (
            <details data-testid="submission-runs">
              <summary>Submission runs ({application.executions.length})</summary>
              <ul>
                {application.executions.map((run) => (
                  <li key={run.id}>
                    Attempt {run.attemptNumber} · started {new Date(run.startedAt).toLocaleString()}
                    {run.clickedAt ? ` · submit clicked ${new Date(run.clickedAt).toLocaleTimeString()}` : " · submit not clicked"}
                    {run.finishedAt ? ` · ${run.result ? STATE_LABELS[run.result as ApplicationState] ?? run.result : "finished"}` : " · running"}
                    {run.submitStatus !== null ? ` · portal answered ${run.submitStatus}` : ""}
                    {run.confirmationReference ? ` · reference ${run.confirmationReference}` : ""}
                    {run.errorType ? ` · ${run.errorType.toLowerCase()}` : ""}
                  </li>
                ))}
              </ul>
            </details>
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

function FieldList({ plan, open }: { plan: FieldPlan[]; open: boolean }) {
  return (
    <details open={open} data-testid="application-fields">
      <summary>Every field and the value it gets ({plan.length})</summary>
      <ul className="application-fields">
        {plan.map((field) => (
          <li key={field.key}>
            <span className={`tag answer-${field.status === "FILLED" ? "from_profile" : field.status === "NEEDS_INPUT" ? "needs_input" : "left_empty"}`}>
              {field.status === "FILLED" ? "Filled" : field.status === "NEEDS_INPUT" ? "Needs you" : "Left empty"}
            </span>{" "}
            <strong>{field.label}</strong>
            {field.required ? " *" : ""}
            {field.value ? `: ${field.value}` : ""}
            {field.kind === "FILE" && field.documentId && field.status === "FILLED" ? (
              <>
                {" "}
                <a href={documentFileUrl(field.documentId)} target="_blank" rel="noreferrer">
                  open the file
                </a>
              </>
            ) : null}
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
