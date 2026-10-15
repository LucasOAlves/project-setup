import { pastedMessageInputSchema, type RecruiterMessagePublic } from "@studio/shared";
import { notFound, validationError } from "../../app-error.js";
import type { EmailAccountService } from "./email-account-service.js";
import type { RecruiterMessageRepository, RecruiterMessageRow } from "./recruiter-message-repository.js";
import { buildMailQuery, matchMessage, parseGmailMessage, senderDomain, type MatchCandidate } from "./recruiter-mail.js";

export const MAIL_LOOKBACK_DAYS = 30;
export const MAIL_BATCH_LIMIT = 50;

type Repo = Pick<RecruiterMessageRepository, "followedApplications" | "knownProviderIds" | "insert" | "forApplication">;
type Accounts = Pick<EmailAccountService, "reader" | "recordCheck">;
// Called with each newly stored message, so the next step (classification) can run. It may
// return the updated row.
type OnStored = (message: RecruiterMessageRow) => Promise<RecruiterMessageRow | null | void>;

export type MailCheckResult =
  | { status: "NOT_CONNECTED" }
  | { status: "NOTHING_TO_FOLLOW" }
  | { status: "CHECKED"; read: number; matched: number }
  | { status: "FAILED"; error: string };

// Reads replies about sent applications (Milestone 5, ticket 3). Only what a Gmail search
// narrowed to ATS and company senders returns is opened, and only messages matching an
// application keep their content.
export class RecruiterMailService {
  constructor(
    private readonly repo: Repo,
    private readonly accounts: Accounts,
    private readonly applicationExists: (applicationId: string) => Promise<boolean>,
    private readonly onStored: OnStored = async () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(): Promise<MailCheckResult> {
    const reader = await this.accounts.reader();
    if (!reader) return { status: "NOT_CONNECTED" };
    try {
      const followed = await this.repo.followedApplications();
      if (followed.length === 0) {
        await this.accounts.recordCheck();
        return { status: "NOTHING_TO_FOLLOW" };
      }
      const candidates: MatchCandidate[] = followed.map((row) => ({
        applicationId: row.applicationId,
        company: row.company,
        companyDomain: websiteDomain(row.website),
        jobTitle: row.jobTitle,
        submittedAt: row.submittedAt,
      }));
      const query = buildMailQuery({
        days: MAIL_LOOKBACK_DAYS,
        companyDomains: candidates.map((candidate) => candidate.companyDomain),
        companyNames: candidates.map((candidate) => candidate.company),
      });
      const refs = await reader.search(query, MAIL_BATCH_LIMIT);
      const known = await this.repo.knownProviderIds(refs.map((ref) => ref.id));
      let read = 0;
      let matched = 0;
      for (const ref of refs) {
        if (known.has(ref.id)) continue;
        const parsed = parseGmailMessage(await reader.message(ref.id));
        read += 1;
        const match = matchMessage(parsed, candidates);
        if (!match) {
          await this.repo.insert(emptyRow(ref.id));
          continue;
        }
        const stored = await this.repo.insert({
          source: "GMAIL",
          providerMessageId: ref.id,
          applicationId: match.applicationId,
          senderDomain: senderDomain(parsed.fromAddress),
          subject: parsed.subject,
          body: parsed.body,
          receivedAt: parsed.receivedAt,
          matchConfidence: match.confidence,
          matchReason: match.reason,
        });
        if (stored) {
          matched += 1;
          await this.onStored(stored);
        }
      }
      await this.accounts.recordCheck();
      return { status: "CHECKED", read, matched };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reading Gmail failed.";
      await this.accounts.recordCheck(message);
      return { status: "FAILED", error: message };
    }
  }

  // A reply the user pastes into an application: the fallback that needs no mailbox.
  async paste(applicationId: string, input: unknown): Promise<RecruiterMessagePublic> {
    const parsed = pastedMessageInputSchema.safeParse(input);
    if (!parsed.success) throw validationError("Paste the message text (and its subject, if you have it).");
    if (!(await this.applicationExists(applicationId))) throw notFound("Application not found.");
    const stored = await this.repo.insert({
      source: "PASTED",
      providerMessageId: null,
      applicationId,
      senderDomain: senderDomain(parsed.data.from),
      subject: parsed.data.subject,
      body: parsed.data.body,
      receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : this.now(),
      matchConfidence: "HIGH",
      matchReason: "pasted by you into this application",
    });
    if (!stored) throw validationError("The message could not be saved.");
    return toPublicMessage((await this.onStored(stored)) || stored);
  }

  async list(applicationId: string): Promise<RecruiterMessagePublic[]> {
    return (await this.repo.forApplication(applicationId)).map(toPublicMessage);
  }
}

function emptyRow(providerMessageId: string) {
  return {
    source: "GMAIL",
    providerMessageId,
    applicationId: null,
    senderDomain: "",
    subject: "",
    body: null,
    receivedAt: null,
    matchConfidence: "",
    matchReason: "",
  };
}

// "https://www.acme.io/careers" → "acme.io"
export function websiteDomain(website: string): string {
  if (!website.trim()) return "";
  try {
    const url = new URL(website.includes("://") ? website : `https://${website}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function toPublicMessage(row: RecruiterMessageRow): RecruiterMessagePublic {
  return {
    id: row.id,
    source: row.source as RecruiterMessagePublic["source"],
    senderDomain: row.senderDomain,
    subject: row.subject,
    body: row.body,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    matchConfidence: row.matchConfidence,
    matchReason: row.matchReason,
    classification: row.classification,
    evidence: row.evidence,
    classifiedBy: row.classifiedBy,
    suggestedStatus: row.suggestedStatus,
    decision: row.decision,
  };
}
