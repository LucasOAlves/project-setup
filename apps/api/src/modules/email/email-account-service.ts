import { conflict, validationError } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type { EmailAccountRepository, EmailAccountRow } from "./email-account-repository.js";
import {
  GmailError,
  GmailReader,
  exchangeGoogleCode,
  googleConsentUrl,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  type GoogleOAuthClient,
} from "./gmail-client.js";
import { issueOAuthState, verifyOAuthState } from "./oauth-state.js";
import { openSecret, sealSecret } from "./secret-box.js";

const PROVIDER = "gmail";
const TOKEN_PURPOSE = "gmail-refresh-token";

export type EmailAccountStatus = {
  // Whether this deployment has a Google OAuth client and an encryption key.
  configured: boolean;
  account: { provider: string; emailAddress: string; connectedAt: string; lastCheckedAt: string | null; lastError: string } | null;
};

type Repo = Pick<EmailAccountRepository, "get" | "save" | "recordCheck" | "remove">;
type Audit = { record(input: AuditEventInput): Promise<void> };

// Connects, reads and disconnects the user's Gmail with the read-only scope (Milestone 5,
// ADR-023). The refresh token never leaves this service in clear: it is sealed before it is
// stored and opened only to ask Google for a short-lived access token.
export class EmailAccountService {
  constructor(
    private readonly repo: Repo,
    private readonly audit: Audit,
    private readonly client: GoogleOAuthClient | null,
    private readonly key: Buffer | null,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private setup(): { client: GoogleOAuthClient; key: Buffer } {
    if (!this.client || !this.key) {
      throw validationError("Gmail is not set up on this deployment. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI and APP_ENCRYPTION_KEY.");
    }
    return { client: this.client, key: this.key };
  }

  async status(): Promise<EmailAccountStatus> {
    const row = await this.repo.get(PROVIDER);
    return { configured: Boolean(this.client && this.key), account: row ? toPublic(row) : null };
  }

  // Where to send the user, and the signed state cookie to set alongside.
  start(): { url: string; cookie: string } {
    const { client, key } = this.setup();
    const issued = issueOAuthState(key, this.now());
    return { url: googleConsentUrl(client, issued.state), cookie: issued.cookie };
  }

  async complete(input: { code: string | undefined; state: string | undefined; cookie: string | undefined; error?: string }): Promise<EmailAccountStatus> {
    const { client, key } = this.setup();
    if (!verifyOAuthState(key, { state: input.state, cookie: input.cookie }, this.now())) {
      throw conflict("This Gmail sign-in did not start here or took too long. Start again from the app.");
    }
    if (input.error || !input.code) throw conflict("Gmail access was not granted.");
    const grant = await exchangeGoogleCode(client, input.code, this.fetchImpl);
    const { emailAddress } = await new GmailReader(grant.accessToken, this.fetchImpl).profile();
    await this.repo.save({ provider: PROVIDER, emailAddress, sealedRefreshToken: sealSecret(key, TOKEN_PURPOSE, grant.refreshToken), scope: grant.scope });
    await this.audit.record({ eventType: "EMAIL_CONNECTED", actor: "USER", entityType: "email_account", entityId: PROVIDER, payload: { provider: PROVIDER, scope: grant.scope } });
    return this.status();
  }

  async disconnect(): Promise<EmailAccountStatus> {
    const row = await this.repo.get(PROVIDER);
    if (!row) return this.status();
    let revoked = false;
    if (this.key) {
      try {
        revoked = await revokeGoogleToken(openSecret(this.key, TOKEN_PURPOSE, row.sealedRefreshToken), this.fetchImpl);
      } catch {
        revoked = false;
      }
    }
    await this.repo.remove(PROVIDER);
    await this.audit.record({ eventType: "EMAIL_DISCONNECTED", actor: "USER", entityType: "email_account", entityId: PROVIDER, payload: { provider: PROVIDER, revoked } });
    return this.status();
  }

  // A reader with a fresh access token, or null when no mailbox is connected. A revoked grant
  // is recorded on the account so the app can ask the user to connect again.
  async reader(): Promise<GmailReader | null> {
    const row = await this.repo.get(PROVIDER);
    if (!row || !this.client || !this.key) return null;
    try {
      const token = await refreshGoogleAccessToken(this.client, openSecret(this.key, TOKEN_PURPOSE, row.sealedRefreshToken), this.fetchImpl);
      return new GmailReader(token, this.fetchImpl);
    } catch (error) {
      const message =
        error instanceof GmailError && error.revoked
          ? "Google no longer accepts the app's access. Connect Gmail again."
          : error instanceof GmailError
            ? error.message
            : "The stored Gmail access could not be opened. Connect Gmail again.";
      await this.repo.recordCheck(PROVIDER, this.now(), message);
      return null;
    }
  }

  async recordCheck(error = ""): Promise<void> {
    await this.repo.recordCheck(PROVIDER, this.now(), error);
  }
}

function toPublic(row: EmailAccountRow): NonNullable<EmailAccountStatus["account"]> {
  return {
    provider: row.provider,
    emailAddress: row.emailAddress,
    connectedAt: row.connectedAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}
