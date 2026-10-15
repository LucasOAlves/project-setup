import assert from "node:assert/strict";
import { test } from "node:test";
import { attentionCount } from "./attention.js";
import { applicationChangeText, budgetText, digestText, followUpText, recruiterMessageText } from "./notification-messages.js";
import { Notifier } from "./notifier.js";
import { TelegramClient } from "./telegram-client.js";

const job = { title: "Senior Engineer", company: "Acme" };
const APP_URL = "https://jobs.example.test";

// --- Message texts: titles, companies and links only.

test("application changes worth hearing about have a text, the rest none", () => {
  assert.match(applicationChangeText({ from: "PREPARING", to: "READY_FOR_REVIEW" }, job, APP_URL)!, /^Ready for your review: Senior Engineer at Acme\..*\nhttps:\/\/jobs\.example\.test$/s);
  assert.match(applicationChangeText({ from: "SUBMITTING", to: "SUBMITTED" }, job, "")!, /^Application sent: Senior Engineer at Acme\.$/);
  assert.match(applicationChangeText({ from: "SUBMITTING", to: "SUBMISSION_UNKNOWN" }, job, "")!, /result unknown/);
  assert.match(applicationChangeText({ from: "SUBMITTING", to: "READY_FOR_REVIEW" }, job, "")!, /^Ready for your review/);
  assert.match(applicationChangeText({ from: "SUBMITTING", to: "FAILED" }, job, "")!, /not sent/);
  assert.equal(applicationChangeText({ from: "READY_FOR_REVIEW", to: "APPROVED" }, job, ""), null);
  assert.equal(applicationChangeText({ from: "PREPARING", to: "NEEDS_INFORMATION" }, job, ""), null);
});

test("only interview, assessment and offer messages are announced, without their text", () => {
  assert.equal(recruiterMessageText("INTERVIEW_REQUEST", job, ""), "Interview request about Senior Engineer at Acme. Read it in the app and accept or dismiss the suggested status.");
  assert.match(recruiterMessageText("OFFER", job, "")!, /^Offer about/);
  for (const quiet of ["APPLICATION_RECEIVED", "REJECTION", "UNCLEAR", "OTHER"]) assert.equal(recruiterMessageText(quiet, job, ""), null, quiet);
});

test("the digest lists the best jobs first, with their links, and says how many more", () => {
  const jobs = Array.from({ length: 12 }, (_, index) => ({ title: `Role ${index}`, company: "Acme", score: 80 + index, url: `https://boards.example/${index}` }));
  const text = digestText(jobs, 80)!;
  const lines = text.split("\n");
  assert.equal(lines[0], "12 new jobs scored 80 or more:");
  assert.equal(lines[1], "91 Role 11 at Acme");
  assert.equal(lines[2], "https://boards.example/11");
  assert.equal(lines.at(-1), "and 2 more in the app.");
  assert.equal(digestText([], 80), null);
});

test("follow-up and budget texts", () => {
  assert.equal(followUpText(job, 12, ""), "No reply from Acme for 12 days (Senior Engineer). Consider following up.");
  assert.match(budgetText("WARNING", 8.004, 10), /80%: \$8\.00 of \$10\.00/);
  assert.match(budgetText("REACHED", 10.2, 10), /paused until next month/);
});

// --- Telegram.

test("Telegram gets the chat id and plain text, and its errors never carry the token", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const ok = new TelegramClient("123:secret-token", "42", (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: 200 });
  }) as typeof fetch);
  await ok.send("Hello");
  assert.equal(requests[0]?.url, "https://api.telegram.org/bot123:secret-token/sendMessage");
  assert.deepEqual(requests[0]?.body, { chat_id: "42", text: "Hello", disable_web_page_preview: true });

  const refused = new TelegramClient("123:secret-token", "42", (async () => new Response("{}", { status: 401 })) as typeof fetch);
  await assert.rejects(refused.send("x"), (error: Error) => error.message === "Telegram answered HTTP 401." && !error.message.includes("secret"));
  const down = new TelegramClient("123:secret-token", "42", (async () => Promise.reject(new Error("connect to https://api.telegram.org/bot123:secret-token failed"))) as typeof fetch);
  await assert.rejects(down.send("x"), (error: Error) => !error.message.includes("secret"));
});

// --- The notifier: off without Telegram, each event once, failures recorded.

function setup(options: { enabled?: boolean; failSend?: boolean } = {}) {
  const sent: string[] = [];
  const claimed = new Set<string>();
  const finished: Array<[string, string]> = [];
  const repo = {
    async claim(key: string) {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    async finish(key: string, status: "SENT" | "FAILED") {
      finished.push([key, status]);
    },
    async applicationJob() {
      return job;
    },
    async highScoresSince() {
      return [{ jobId: "j1", title: "Staff Engineer", company: "Globex", url: "https://boards.example/1", score: 88 }];
    },
  };
  const sender = options.enabled === false ? null : { send: async (text: string) => (options.failSend ? Promise.reject(new Error("Telegram answered HTTP 500.")) : void sent.push(text)) };
  const notifier = new Notifier(sender, repo, { appUrl: "", digestMinScore: 80 }, () => new Date("2026-10-15T08:00:00Z"));
  return { notifier, sent, finished };
}

const change = { applicationId: "a1", from: "PREPARING", to: "READY_FOR_REVIEW", actor: "WORKER", at: new Date("2026-10-15T07:00:00Z") };

test("an event is sent once, and the user's own changes are not announced", async () => {
  const { notifier, sent, finished } = setup();
  await notifier.applicationChanged(change);
  await notifier.applicationChanged(change);
  await notifier.applicationChanged({ ...change, actor: "USER", at: new Date() });
  assert.equal(sent.length, 1);
  assert.deepEqual(finished, [["application.a1.READY_FOR_REVIEW.1792047600000", "SENT"]]);
});

test("without Telegram nothing is sent or claimed", async () => {
  const { notifier, finished } = setup({ enabled: false });
  assert.equal(notifier.enabled, false);
  await notifier.applicationChanged(change);
  assert.deepEqual(await notifier.daily(async () => []), { digest: 0, followUps: 0 });
  assert.equal(finished.length, 0);
});

test("a failed send is recorded and does not throw", async () => {
  const { notifier, finished } = setup({ failSend: true });
  await notifier.messageClassified({ id: "m1", applicationId: "a1", classification: "OFFER" });
  assert.deepEqual(finished, [["message.m1", "FAILED"]]);
});

test("the daily run sends the digest and each due follow-up once", async () => {
  const { notifier, sent } = setup();
  const followUps = async () => [
    { applicationId: "a1", job, followUp: { due: true, waitingDays: 11 } },
    { applicationId: "a2", job, followUp: { due: false, waitingDays: 3 } },
  ];
  assert.deepEqual(await notifier.daily(followUps), { digest: 1, followUps: 1 });
  assert.deepEqual(await notifier.daily(followUps), { digest: 1, followUps: 0 });
  assert.equal(sent.length, 2, "the second run sends nothing new");
  assert.match(sent[0]!, /^1 new job scored 80 or more:\n88 Staff Engineer at Globex/);
});

test("budget crossings are sent once a month per threshold", async () => {
  const { notifier, sent } = setup();
  await notifier.budgetCrossed({ state: "WARNING", spentUsd: 8, budgetUsd: 10 });
  await notifier.budgetCrossed({ state: "WARNING", spentUsd: 8.5, budgetUsd: 10 });
  await notifier.budgetCrossed({ state: "REACHED", spentUsd: 10, budgetUsd: 10 });
  assert.equal(sent.length, 2);
});

// --- The count on the Applications step.

test("the count adds applications waiting on you, open suggestions and follow-ups due", () => {
  const count = attentionCount({
    inboxStatuses: ["READY_FOR_REVIEW", "SUBMITTING", "SUBMISSION_UNKNOWN", "APPROVED"],
    sent: [
      { messages: [{ suggestedStatus: "INTERVIEW", decision: "" }, { suggestedStatus: "APPLIED", decision: "ACCEPTED" }, { suggestedStatus: "", decision: "" }], followUp: { due: false } },
      { messages: [], followUp: { due: true } },
    ],
  });
  assert.deepEqual(count, { applications: 2, suggestions: 1, followUps: 1, total: 4 });
});
