import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { AppError } from "../../app-error.js";
import type { AuditEventInput } from "../audit/audit-repository.js";
import type { EmailAccountRow } from "./email-account-repository.js";
import { EmailAccountService } from "./email-account-service.js";
import { GMAIL_READONLY_SCOPE } from "./gmail-client.js";

const CLIENT = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "http://localhost:5173/api/email/google/callback" };

function setup(options: { scope?: string; tokenError?: string } = {}) {
  let row: EmailAccountRow | null = null;
  const audits: AuditEventInput[] = [];
  const calls: Array<{ url: string; body: string }> = [];
  const repo = {
    async get() {
      return row;
    },
    async save(input: Pick<EmailAccountRow, "provider" | "emailAddress" | "sealedRefreshToken" | "scope">) {
      row = { id: "a", connectedAt: new Date(), lastCheckedAt: null, lastError: "", ...input };
      return row;
    },
    async recordCheck(_provider: string, at: Date, error = "") {
      if (row) row = { ...row, lastCheckedAt: at, lastError: error };
    },
    async remove() {
      row = null;
    },
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, body });
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (options.tokenError) return json(400, { error: options.tokenError, error_description: "secret detail" });
      if (body.includes("grant_type=authorization_code")) {
        return json(200, { access_token: "access-1", refresh_token: "refresh-secret-1", scope: options.scope ?? GMAIL_READONLY_SCOPE, expires_in: 3599 });
      }
      return json(200, { access_token: "access-2", expires_in: 3599 });
    }
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return json(200, {});
    if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/profile")) return json(200, { emailAddress: "me@example.com", historyId: "1" });
    return json(404, {});
  }) as typeof fetch;
  const service = new EmailAccountService(repo, { record: async (event) => void audits.push(event) }, CLIENT, randomBytes(32), fetchImpl);
  return { service, audits, calls, row: () => row };
}

function stateFrom(url: string) {
  return new URL(url).searchParams.get("state") ?? undefined;
}

test("the consent URL asks Google for read-only Gmail and a refresh token", () => {
  const { service } = setup();
  const { url } = service.start();
  const params = new URL(url).searchParams;
  assert.equal(params.get("scope"), GMAIL_READONLY_SCOPE);
  assert.equal(params.get("access_type"), "offline");
  assert.equal(params.get("redirect_uri"), CLIENT.redirectUri);
});

test("connecting stores the address and a sealed refresh token, never the token itself", async () => {
  const { service, audits, row } = setup();
  const { url, cookie } = service.start();
  const status = await service.complete({ code: "code-1", state: stateFrom(url), cookie });
  assert.equal(status.account?.emailAddress, "me@example.com");
  assert.ok(!row()!.sealedRefreshToken.includes("refresh-secret-1"));
  assert.match(row()!.sealedRefreshToken, /^v1\./);
  assert.equal(audits[0]?.eventType, "EMAIL_CONNECTED");
  assert.ok(!JSON.stringify(audits).includes("me@example.com"), "the audit payload carries no address");
});

test("a callback without the matching state, or a grant beyond read-only, connects nothing", async () => {
  const forged = setup();
  const started = forged.service.start();
  await assert.rejects(forged.service.complete({ code: "code-1", state: "someone-else", cookie: started.cookie }), AppError);
  assert.equal(forged.row(), null);
  assert.equal(forged.calls.length, 0, "Google is not even asked");

  const broad = setup({ scope: `${GMAIL_READONLY_SCOPE} https://mail.google.com/` });
  const begun = broad.service.start();
  await assert.rejects(broad.service.complete({ code: "code-1", state: stateFrom(begun.url), cookie: begun.cookie }), /more than read-only/);
  assert.equal(broad.row(), null);
});

test("a reader gets a fresh access token, and a revoked grant asks the user to connect again", async () => {
  const ok = setup();
  const started = ok.service.start();
  await ok.service.complete({ code: "code-1", state: stateFrom(started.url), cookie: started.cookie });
  assert.ok(await ok.service.reader());
  assert.ok(ok.calls.some((call) => call.body.includes("grant_type=refresh_token") && call.body.includes("refresh-secret-1")));

  const revoked = setup();
  const begun = revoked.service.start();
  await revoked.service.complete({ code: "code-1", state: stateFrom(begun.url), cookie: begun.cookie });
  (revoked.service as unknown as { fetchImpl: typeof fetch }).fetchImpl = (async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
  assert.equal(await revoked.service.reader(), null);
  assert.match(revoked.row()!.lastError, /Connect Gmail again/);
});

test("disconnecting revokes the token at Google and deletes it here", async () => {
  const { service, calls, row, audits } = setup();
  const started = service.start();
  await service.complete({ code: "code-1", state: stateFrom(started.url), cookie: started.cookie });
  const status = await service.disconnect();
  assert.equal(status.account, null);
  assert.equal(row(), null);
  assert.ok(calls.some((call) => call.url.startsWith("https://oauth2.googleapis.com/revoke") && call.body.includes("refresh-secret-1")));
  assert.equal(audits.at(-1)?.payload?.revoked, true);
});

test("without a client or key the deployment says Gmail is not set up", async () => {
  const service = new EmailAccountService({ get: async () => null, save: async () => assert.fail(), recordCheck: async () => undefined, remove: async () => undefined }, { record: async () => undefined }, null, null);
  assert.deepEqual(await service.status(), { configured: false, account: null });
  assert.throws(() => service.start(), /not set up/);
});
