import assert from "node:assert/strict";
import { test } from "node:test";
import type { GmailMessage } from "./gmail-client.js";
import type { NewRecruiterMessage, RecruiterMessageRow } from "./recruiter-message-repository.js";
import { RecruiterMailService, websiteDomain } from "./recruiter-mail-service.js";

const b64 = (text: string) => Buffer.from(text).toString("base64url");
const NOW = new Date("2026-10-15T12:00:00Z");

function gmail(id: string, from: string, subject: string, body: string): GmailMessage {
  return {
    id,
    threadId: id,
    internalDate: String(Date.parse("2026-10-14T10:00:00Z")),
    payload: { mimeType: "text/plain", headers: [{ name: "From", value: from }, { name: "Subject", value: subject }], body: { data: b64(body) } },
  };
}

function setup(options: { connected?: boolean; followed?: boolean; failSearch?: boolean } = {}) {
  const rows: RecruiterMessageRow[] = [];
  const checks: string[] = [];
  const queries: string[] = [];
  const opened: string[] = [];
  const stored: RecruiterMessageRow[] = [];
  const inbox = [
    gmail("g1", "Acme <no-reply@hire.lever.co>", "Thanks for applying to Acme", "We received your application for Senior Engineer."),
    gmail("g2", "Newsletter <news@shop.example>", "Big sale", "Unrelated."),
  ];
  const reader = {
    search: async (query: string) => {
      if (options.failSearch) throw new Error("Gmail answered HTTP 500.");
      queries.push(query);
      return inbox.map((message) => ({ id: message.id, threadId: message.id }));
    },
    message: async (id: string) => {
      opened.push(id);
      return inbox.find((message) => message.id === id)!;
    },
  };
  const service = new RecruiterMailService(
    {
      followedApplications: async () =>
        options.followed === false ? [] : [{ applicationId: "app-1", jobTitle: "Senior Engineer", company: "Acme", website: "https://www.acme.io", submittedAt: new Date("2026-10-10T00:00:00Z") }],
      knownProviderIds: async (ids) => new Set(rows.flatMap((row) => (row.providerMessageId && ids.includes(row.providerMessageId) ? [row.providerMessageId] : []))),
      insert: async (input: NewRecruiterMessage) => {
        if (input.providerMessageId && rows.some((row) => row.providerMessageId === input.providerMessageId)) return null;
        const row = { id: `00000000-0000-4000-8000-00000000000${rows.length + 1}`, classification: "", evidence: "", suggestedStatus: "", decision: "", decidedAt: null, createdAt: NOW, ...input } as RecruiterMessageRow;
        rows.push(row);
        return row;
      },
      forApplication: async (id) => rows.filter((row) => row.applicationId === id),
    },
    {
      reader: async () => (options.connected === false ? null : (reader as never)),
      recordCheck: async (error = "") => void checks.push(error),
    },
    async (id) => id === "app-1",
    async (row) => void stored.push(row),
    () => NOW,
  );
  return { service, rows, checks, queries, opened, stored };
}

test("a check opens what the narrowed search returns, keeps matched messages and only the id of the rest", async () => {
  const { service, rows, checks, queries, stored } = setup();
  const result = await service.check();
  assert.deepEqual(result, { status: "CHECKED", read: 2, matched: 1 });
  assert.match(queries[0]!, /from:acme\.io/);
  assert.match(queries[0]!, /subject:"Acme"/);
  const matched = rows.find((row) => row.providerMessageId === "g1")!;
  assert.equal(matched.applicationId, "app-1");
  assert.equal(matched.senderDomain, "hire.lever.co");
  assert.match(matched.body ?? "", /Senior Engineer/);
  const other = rows.find((row) => row.providerMessageId === "g2")!;
  assert.deepEqual([other.applicationId, other.subject, other.body, other.senderDomain], [null, "", null, ""], "nothing of an unrelated message is kept");
  assert.equal(stored.length, 1, "only the matched message goes on to classification");
  assert.deepEqual(checks, [""]);
});

test("a second check opens nothing it already read", async () => {
  const { service, opened } = setup();
  await service.check();
  const again = await service.check();
  assert.deepEqual(again, { status: "CHECKED", read: 0, matched: 0 });
  assert.deepEqual(opened, ["g1", "g2"]);
});

test("no mailbox, nothing sent yet, or a Gmail error is reported without throwing", async () => {
  assert.deepEqual(await setup({ connected: false }).service.check(), { status: "NOT_CONNECTED" });
  const idle = setup({ followed: false });
  assert.deepEqual(await idle.service.check(), { status: "NOTHING_TO_FOLLOW" });
  assert.equal(idle.queries.length, 0, "Gmail is not searched when no application is followed");
  const failing = setup({ failSearch: true });
  assert.deepEqual(await failing.service.check(), { status: "FAILED", error: "Gmail answered HTTP 500." });
  assert.deepEqual(failing.checks, ["Gmail answered HTTP 500."]);
});

test("a pasted reply is stored on its application and goes on to classification", async () => {
  const { service, stored } = setup();
  const message = await service.paste("app-1", { subject: "Interview", body: "Can we talk on Monday?", from: "jane@acme.io" });
  assert.equal(message.source, "PASTED");
  assert.equal(message.senderDomain, "acme.io");
  assert.equal(stored.length, 1);
  await assert.rejects(service.paste("app-1", { body: "" }), /Paste the message/);
  await assert.rejects(service.paste("missing", { body: "x" }), /not found/);
});

test("a company website gives its mail domain", () => {
  assert.equal(websiteDomain("https://www.Acme.io/careers"), "acme.io");
  assert.equal(websiteDomain("acme.io"), "acme.io");
  assert.equal(websiteDomain(""), "");
});
