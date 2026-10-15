import { useEffect, useState, type ReactNode } from "react";
import type {
  ApplicationAnswersContent,
  ApplicationDocumentPublic,
  ApplicationDocumentType,
  CoverLetterContent,
  TailoredCvContent,
} from "@studio/shared";
import {
  documentFileUrl,
  fetchJobDocuments,
  generateAnswers,
  generateCoverLetter,
  generateCv,
  saveAnswersEdit,
  saveCoverLetterEdit,
  type ApiError,
  type DocumentSaveResult,
} from "./api";

const STATUS_LABELS: Record<ApplicationAnswersContent["answers"][number]["status"], string> = {
  FROM_PROFILE: "From your details",
  DRAFTED: "Drafted, review it",
  NEEDS_INPUT: "Needs your input",
  FROM_YOU: "Your answer",
};

function versionLine(document: ApplicationDocumentPublic): string {
  return [
    `Version ${document.version}`,
    document.origin === "EDITED" ? "edited by you" : "generated",
    new Date(document.createdAt).toLocaleString(),
    `profile v${document.profileVersion}`,
  ].join(" · ");
}

// Application materials for one job (Milestone 2): generate, review gaps, edit, download and see
// every saved version. Nothing here is sent anywhere; the user copies or downloads what they use.
export function MaterialsPanel({ jobId }: { jobId: string }) {
  const [documents, setDocuments] = useState<ApplicationDocumentPublic[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    setDocuments(await fetchJobDocuments(jobId));
  }

  useEffect(() => {
    reload().catch((caught: ApiError) => setError(caught.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function run(label: string, action: () => Promise<DocumentSaveResult>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result.created ? `Saved version ${result.document.version}.` : "Nothing changed since the latest version.");
      await reload();
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const versions = (type: ApplicationDocumentType) =>
    documents.filter((document) => document.type === type).sort((a, b) => b.version - a.version);

  return (
    <div className="materials" data-testid="materials-panel">
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <MaterialSection
        title="Tailored CV"
        versions={versions("CV")}
        actionLabel="Generate CV"
        busy={busy === "cv"}
        disabled={busy !== null}
        onGenerate={() => void run("cv", () => generateCv(jobId))}
        render={(document) => <CvSummary content={document.content as TailoredCvContent} />}
      />
      <MaterialSection
        title="Cover letter (optional)"
        versions={versions("COVER_LETTER")}
        actionLabel="Write cover letter"
        busy={busy === "letter"}
        disabled={busy !== null}
        onGenerate={() => void run("letter", () => generateCoverLetter(jobId))}
        render={(document) => (
          <CoverLetterEditor
            key={document.id}
            content={document.content as CoverLetterContent}
            saving={busy === "letter-edit"}
            onSave={(edit) => void run("letter-edit", () => saveCoverLetterEdit(jobId, edit))}
          />
        )}
      />
      <MaterialSection
        title="Application answers"
        versions={versions("APPLICATION_ANSWERS")}
        actionLabel="Prepare answers"
        busy={busy === "answers"}
        disabled={busy !== null}
        onGenerate={() => void run("answers", () => generateAnswers(jobId))}
        render={(document) => (
          <AnswersEditor
            key={document.id}
            content={document.content as ApplicationAnswersContent}
            saving={busy === "answers-edit"}
            onSave={(answers) => void run("answers-edit", () => saveAnswersEdit(jobId, { answers }))}
          />
        )}
      />
    </div>
  );
}

function MaterialSection({
  title,
  versions,
  actionLabel,
  busy,
  disabled,
  onGenerate,
  render,
}: {
  title: string;
  versions: ApplicationDocumentPublic[];
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  onGenerate: () => void;
  render: (document: ApplicationDocumentPublic) => ReactNode;
}) {
  const latest = versions[0];
  return (
    <section className="materials-section">
      <div className="actions" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <button className="btn ghost" type="button" disabled={disabled} onClick={onGenerate}>
          {busy ? "Working…" : latest ? `${actionLabel} again` : actionLabel}
        </button>
      </div>
      {latest ? (
        <>
          <p className="eyebrow">
            {versionLine(latest)}
            {latest.hasFile ? (
              <>
                {" · "}
                <a href={documentFileUrl(latest.id)}>Download PDF</a>
              </>
            ) : null}
          </p>
          {render(latest)}
          {versions.length > 1 ? (
            <details>
              <summary>Earlier versions ({versions.length - 1})</summary>
              <ul>
                {versions.slice(1).map((document) => (
                  <li key={document.id}>
                    {versionLine(document)}
                    {document.hasFile ? (
                      <>
                        {" · "}
                        <a href={documentFileUrl(document.id)}>PDF</a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CvSummary({ content }: { content: TailoredCvContent }) {
  return (
    <div data-testid="cv-summary">
      {content.gaps.length > 0 ? (
        <div className="notice">
          The job asks for {content.gaps.join(", ")}, which your profile does not show. They were left out of the CV.
        </div>
      ) : null}
      {content.missingDetails.length > 0 ? (
        <div className="notice">Missing from Application details: {content.missingDetails.join(", ")}.</div>
      ) : null}
      {content.droppedSummarySentences > 0 ? (
        <p className="status">
          {content.droppedSummarySentences} summary sentence{content.droppedSummarySentences === 1 ? " was" : "s were"} removed
          because your profile does not support {content.droppedSummarySentences === 1 ? "it" : "them"}.
        </p>
      ) : null}
      {content.rationale ? <p className="status">{content.rationale}</p> : null}
      {content.summary.length > 0 ? <p>{content.summary.join(" ")}</p> : null}
      {content.experiences.map((experience) => (
        <div key={experience.id}>
          <strong>{[experience.role, experience.company].filter(Boolean).join(", ")}</strong>
          <ul>
            {experience.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CoverLetterEditor({
  content,
  saving,
  onSave,
}: {
  content: CoverLetterContent;
  saving: boolean;
  onSave: (edit: { greeting: string; paragraphs: string[]; signOff: string }) => void;
}) {
  const [greeting, setGreeting] = useState(content.greeting);
  const [body, setBody] = useState(content.paragraphs.join("\n\n"));
  const [signOff, setSignOff] = useState(content.signOff);
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div data-testid="cover-letter">
      {content.droppedSentences > 0 ? (
        <p className="status">
          {content.droppedSentences} sentence{content.droppedSentences === 1 ? " was" : "s were"} removed because your profile or the
          posting does not support {content.droppedSentences === 1 ? "it" : "them"}.
        </p>
      ) : null}
      <label className="field">
        Greeting
        <input value={greeting} onChange={(event) => setGreeting(event.target.value)} />
      </label>
      <label className="field">
        Letter (blank line between paragraphs)
        <textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <label className="field">
        Sign-off
        <textarea rows={2} value={signOff} onChange={(event) => setSignOff(event.target.value)} />
      </label>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button
          className="btn ghost"
          type="button"
          disabled={saving || paragraphs.length === 0 || !greeting.trim() || !signOff.trim()}
          onClick={() => onSave({ greeting: greeting.trim(), paragraphs, signOff: signOff.trim() })}
        >
          {saving ? "Saving…" : "Save my edit as a new version"}
        </button>
      </div>
    </div>
  );
}

function AnswersEditor({
  content,
  saving,
  onSave,
}: {
  content: ApplicationAnswersContent;
  saving: boolean;
  onSave: (answers: Array<{ id: string; answer: string }>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(content.answers.map((answer) => [answer.id, answer.answer])),
  );
  const changed = content.answers
    .filter((answer) => (drafts[answer.id] ?? "").trim() !== answer.answer)
    .map((answer) => ({ id: answer.id, answer: (drafts[answer.id] ?? "").trim() }));
  const needsInput = content.answers.filter((answer) => answer.status === "NEEDS_INPUT").length;

  return (
    <div data-testid="answers">
      {needsInput > 0 ? <p className="status">{needsInput} answers need your input.</p> : null}
      {content.answers.map((answer) => (
        <label className="field" key={answer.id} data-testid={`answer-${answer.id}`}>
          <span>
            {answer.question} <span className={`tag answer-${answer.status.toLowerCase()}`}>{STATUS_LABELS[answer.status]}</span>
          </span>
          {answer.id === "WHY_COMPANY" ? (
            <textarea rows={4} value={drafts[answer.id] ?? ""} onChange={(event) => setDrafts({ ...drafts, [answer.id]: event.target.value })} />
          ) : (
            <input value={drafts[answer.id] ?? ""} onChange={(event) => setDrafts({ ...drafts, [answer.id]: event.target.value })} />
          )}
          {answer.note ? <span className="status">{answer.note}</span> : null}
        </label>
      ))}
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost" type="button" disabled={saving || changed.length === 0} onClick={() => onSave(changed)}>
          {saving ? "Saving…" : "Save my answers as a new version"}
        </button>
      </div>
    </div>
  );
}
