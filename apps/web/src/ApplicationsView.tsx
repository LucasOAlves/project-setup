import { useEffect, useRef, useState } from "react";
import type { ApplicationInbox, ApplicationInboxItem, ApplicationState, SourcePublic } from "@studio/shared";
import { ApplicationPanel } from "./ApplicationPanel";
import { SentApplications } from "./SentApplications";
import {
  checkEmailNow,
  disconnectEmail,
  fetchApplicationInbox,
  fetchEmailAccount,
  fetchSources,
  setSourceApplicationMode,
  startGmailConnect,
  type ApiError,
  type EmailAccountStatus,
} from "./api";

// The order the inbox shows: what needs a decision first, then what is running.
const INBOX_ORDER: ApplicationState[] = [
  "SUBMISSION_UNKNOWN",
  "READY_FOR_REVIEW",
  "NEEDS_INFORMATION",
  "BLOCKED_BY_PLATFORM",
  "APPROVED",
  "SUBMITTING",
];

const INBOX_LABELS: Partial<Record<ApplicationState, string>> = {
  SUBMISSION_UNKNOWN: "Result unknown: check and tell the app",
  READY_FOR_REVIEW: "Ready for your review",
  NEEDS_INFORMATION: "Needs your answers",
  BLOCKED_BY_PLATFORM: "Blocked by the portal: apply by hand",
  APPROVED: "Approved",
  SUBMITTING: "Submitting",
  SUBMITTED: "Submitted",
  USER_REJECTED: "Not applying",
  PREPARING: "Preparing",
  FAILED: "Failed",
};

const AUTOMATABLE = ["greenhouse", "lever", "ashby"];

// The approval inbox (Milestone 4): every application that waits on you or is being submitted,
// with the full review panel for the one you open, and the submission settings.
export function ApplicationsView() {
  const [inbox, setInbox] = useState<ApplicationInbox | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;
  const [error, setError] = useState<string | null>(null);

  // The open application stays on screen after it leaves the inbox (submitted, say), so you
  // see how it ended. It goes once you close it.
  async function reload() {
    try {
      const next = await fetchApplicationInbox();
      setInbox((previous) => {
        const kept = previous?.items.find((item) => item.application.id === openIdRef.current);
        const missing = kept && !next.items.some((item) => item.application.id === kept.application.id);
        return missing ? { ...next, items: [...next.items, kept] } : next;
      });
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const items = [...(inbox?.items ?? [])].sort(
    (a, b) => INBOX_ORDER.indexOf(a.application.status) - INBOX_ORDER.indexOf(b.application.status),
  );

  return (
    <div data-testid="applications-view">
      <p className="lede">
        Applications that wait on you or are being sent. Open one to see the form, every value and file that will be sent, and where
        it goes, then approve it or decide not to apply.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {inbox && items.length === 0 ? <p className="status">Nothing waits on you. Prepare an application from the Job feed.</p> : null}
      {items.map((item) => (
        <InboxItem
          key={item.application.id}
          item={item}
          open={openId === item.application.id}
          onToggle={() => setOpenId(openId === item.application.id ? null : item.application.id)}
          onChange={(application) => {
            setInbox((current) =>
              current
                ? { ...current, items: current.items.map((candidate) => (candidate.application.id === application.id ? { ...candidate, application } : candidate)) }
                : current,
            );
            void reload();
          }}
        />
      ))}
      <SentApplications />
      <RecruiterEmail />
      {inbox ? <SubmissionSettings submissionEnabled={inbox.submissionEnabled} /> : null}
    </div>
  );
}

function InboxItem({ item, open, onToggle, onChange }: { item: ApplicationInboxItem; open: boolean; onToggle: () => void; onChange: (application: ApplicationInboxItem["application"]) => void }) {
  const { application, job } = item;
  return (
    <section className="article-card" data-testid="inbox-item">
      <h3>
        {job.title} <span className="status">at {job.company}</span>
      </h3>
      <div className="tags">
        <span className={`tag application-${application.status.toLowerCase()}`}>{INBOX_LABELS[application.status] ?? application.status}</span>
        <span className="tag">{application.portal ?? "manual"}</span>
        <span className="tag">{hostOf(application.destinationUrl)}</span>
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost" type="button" onClick={onToggle}>
          {open ? "Close" : "Open"}
        </button>
      </div>
      {open ? <ApplicationPanel jobId={job.id} jobUrl={application.destinationUrl} onChange={onChange} /> : null}
    </section>
  );
}

// The mailbox the app reads recruiter replies from (Milestone 5): Gmail, read-only.
function RecruiterEmail() {
  const [status, setStatus] = useState<EmailAccountStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [returned] = useState(() => new URLSearchParams(window.location.search).get("email"));

  useEffect(() => {
    fetchEmailAccount()
      .then(setStatus)
      .catch((caught: ApiError) => setError(caught.message));
    if (returned) window.history.replaceState(null, "", window.location.pathname);
  }, [returned]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await startGmailConnect());
    } catch (caught) {
      setError((caught as ApiError).message);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await disconnectEmail());
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await checkEmailNow();
      setNotice("Checking Gmail now. New replies appear on each application in a minute or two.");
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const account = status?.account;
  return (
    <section className="article-card" data-testid="recruiter-email">
      <h3>Recruiter email</h3>
      <p className="status">
        The app reads replies to your applications from Gmail with read-only access: it can never send, change or delete mail, and
        only messages from the companies and portals you applied to are kept.
      </p>
      {returned === "connected" ? <p className="status">Gmail is connected.</p> : null}
      {returned === "failed" ? <div className="error">Gmail was not connected. Try again, and allow read access when Google asks.</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {status && !status.configured ? (
        <p className="status" data-testid="email-not-configured">
          Not set up on this deployment. See "Recruiter email" in the README to create your Google OAuth client.
        </p>
      ) : null}
      {account ? (
        <>
          <p data-testid="email-connected">
            Connected: <strong>{account.emailAddress}</strong> since {new Date(account.connectedAt).toLocaleDateString()}
            {account.lastCheckedAt ? `, last checked ${new Date(account.lastCheckedAt).toLocaleString()}` : ""}.
          </p>
          {account.lastError ? <div className="error">{account.lastError}</div> : null}
          {notice ? <p className="status">{notice}</p> : null}
          <div className="actions" style={{ justifyContent: "flex-start" }}>
            {!account.lastError ? (
              <button className="btn" type="button" disabled={busy} onClick={() => void checkNow()}>
                Check now
              </button>
            ) : null}
            {account.lastError ? (
              <button className="btn" type="button" disabled={busy} onClick={() => void connect()}>
                Connect Gmail again
              </button>
            ) : null}
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      ) : status?.configured ? (
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void connect()}>
            Connect Gmail (read-only)
          </button>
        </div>
      ) : null}
    </section>
  );
}

// Whether the app may submit by itself: the deployment switch, and each portal's mode.
function SubmissionSettings({ submissionEnabled }: { submissionEnabled: boolean }) {
  const [sources, setSources] = useState<SourcePublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSources()
      .then((list) => setSources(list.filter((source) => AUTOMATABLE.includes(source.id))))
      .catch((caught: ApiError) => setError(caught.message));
  }, []);

  async function toggle(source: SourcePublic) {
    setError(null);
    try {
      const next = await setSourceApplicationMode(source.id, source.applicationMode === "AUTOMATED" ? "ASSISTED" : "AUTOMATED");
      setSources((current) => (current ?? []).map((candidate) => (candidate.id === next.id ? next : candidate)));
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  return (
    <section className="article-card" data-testid="submission-settings">
      <h3>Submission settings</h3>
      <p className="status" data-testid="submission-switch">
        {submissionEnabled
          ? "Automatic submission is on for this deployment. A portal set to automatic is submitted by the app after you approve."
          : "Automatic submission is off for this deployment (APPLICATION_SUBMISSION_ENABLED). You submit approved applications yourself."}
      </p>
      <p className="status">Check each portal's terms before letting the app submit there. Assisted means the app prepares and you submit.</p>
      {error ? <div className="error">{error}</div> : null}
      <ul>
        {(sources ?? []).map((source) => (
          <li key={source.id} data-testid={`source-mode-${source.id}`}>
            <strong>{source.domain}</strong>: {source.applicationMode === "AUTOMATED" ? "automatic" : "assisted"}{" "}
            <button className="btn ghost" type="button" onClick={() => void toggle(source)}>
              {source.applicationMode === "AUTOMATED" ? "Switch to assisted" : "Let the app submit"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
