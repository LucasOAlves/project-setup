import assert from "node:assert/strict";
import { test } from "node:test";
import { ATS_MAIL_DOMAINS, buildMailQuery, matchMessage, parseGmailMessage, senderDomain, type MatchCandidate, type ParsedMessage } from "./recruiter-mail.js";

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

// --- The Gmail search: recent mail from ATS domains and the companies applied to only.

test("the search covers recent mail from the ATS domains and each company's own domain, never sent mail", () => {
  const query = buildMailQuery({ days: 30, companyDomains: ["acme.io", "acme.io", "globex.com"], companyNames: [] });
  assert.match(query, /^newer_than:30d -in:sent -in:chats \(/);
  for (const domain of ["greenhouse.io", "lever.co", "ashbyhq.com"]) assert.ok(query.includes(`from:${domain}`), domain);
  assert.equal(query.split("from:acme.io").length, 2, "each domain once");
  assert.ok(query.includes("from:globex.com"));
});

test("company names go in as quoted subject terms, with quotes and parentheses removed", () => {
  const query = buildMailQuery({ days: 14, companyDomains: [], companyNames: ['Acme "Labs" (BR)', "  ", "Globex"] });
  assert.ok(query.includes('subject:"Acme Labs BR"'));
  assert.ok(query.includes('subject:"Globex"'));
  assert.ok(!query.includes('subject:""'));
});

test("the ATS list includes the domains their notification mail comes from", () => {
  for (const domain of ["greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "workablemail.com", "smartrecruiters.com"]) {
    assert.ok(ATS_MAIL_DOMAINS.some((known) => domain === known || domain.endsWith(`.${known}`)), domain);
  }
});

// --- Reading a Gmail message.

test("a message is read from its headers and plain-text part", () => {
  const parsed = parseGmailMessage({
    id: "m1",
    threadId: "t1",
    internalDate: String(Date.parse("2026-10-15T09:00:00Z")),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Acme Recruiting <no-reply@us.greenhouse-mail.io>" },
        { name: "Subject", value: "Thank you for applying to Acme" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64("Hi,\r\nThanks for applying to Senior Engineer at Acme.") } },
        { mimeType: "text/html", body: { data: b64("<p>ignored</p>") } },
      ],
    },
  });
  assert.deepEqual(parsed, {
    providerMessageId: "m1",
    fromAddress: "no-reply@us.greenhouse-mail.io",
    fromName: "Acme Recruiting",
    subject: "Thank you for applying to Acme",
    body: "Hi,\nThanks for applying to Senior Engineer at Acme.",
    receivedAt: new Date("2026-10-15T09:00:00Z"),
  });
});

test("an HTML-only message becomes text without tags, scripts or styles", () => {
  const parsed = parseGmailMessage({
    id: "m2",
    threadId: "t2",
    internalDate: "0",
    payload: {
      mimeType: "text/html",
      headers: [{ name: "from", value: "talent@acme.io" }, { name: "subject", value: "Next steps" }],
      body: { data: b64("<style>p{}</style><script>x()</script><p>Hello&nbsp;there &amp; welcome</p><br><div>Pick a time</div>") },
    },
  });
  assert.equal(parsed.fromAddress, "talent@acme.io");
  assert.equal(parsed.fromName, "");
  assert.equal(parsed.body, "Hello there & welcome\nPick a time");
});

test("a very long body is cut, and attachments are never read", () => {
  const parsed = parseGmailMessage({
    id: "m3",
    threadId: "t3",
    internalDate: "0",
    payload: {
      mimeType: "multipart/mixed",
      headers: [],
      parts: [
        { mimeType: "text/plain", body: { data: b64("x".repeat(50_000)) } },
        { mimeType: "application/pdf", filename: "offer.pdf", body: { data: b64("%PDF") } },
      ],
    },
  });
  assert.equal(parsed.body.length, 20_000);
  assert.equal(parsed.subject, "");
});

test("the sender's domain is the part after @, lower-cased", () => {
  assert.equal(senderDomain("Jane@Mail.Acme.IO"), "mail.acme.io");
  assert.equal(senderDomain("not-an-address"), "");
});

// --- Matching a message to the application it is about.

const SUBMITTED = new Date("2026-10-10T12:00:00Z");
const acme: MatchCandidate = { applicationId: "app-acme", company: "Acme", companyDomain: "acme.io", jobTitle: "Senior Backend Engineer", submittedAt: SUBMITTED };
const acme2: MatchCandidate = { applicationId: "app-acme-2", company: "Acme", companyDomain: "acme.io", jobTitle: "Staff Engineer", submittedAt: new Date("2026-10-12T12:00:00Z") };
const globex: MatchCandidate = { applicationId: "app-globex", company: "Globex", companyDomain: "", jobTitle: "Tech Lead", submittedAt: SUBMITTED };

function message(overrides: Partial<ParsedMessage>): ParsedMessage {
  return {
    providerMessageId: "m",
    fromAddress: "someone@example.com",
    fromName: "",
    subject: "",
    body: "",
    receivedAt: new Date("2026-10-14T12:00:00Z"),
    ...overrides,
  };
}

test("mail from the company's own domain matches its application", () => {
  const match = matchMessage(message({ fromAddress: "jane@acme.io", subject: "Quick chat?" }), [acme, globex]);
  assert.equal(match?.applicationId, "app-acme");
  assert.equal(match?.confidence, "HIGH");
});

test("ATS mail matches when it names the company", () => {
  const match = matchMessage(
    message({ fromAddress: "no-reply@hire.lever.co", subject: "Your application to Globex", body: "Thanks for applying for Tech Lead." }),
    [acme, globex],
  );
  assert.equal(match?.applicationId, "app-globex");
  assert.equal(match?.confidence, "HIGH");
});

test("the company's name as a whole word counts, not inside another word", () => {
  assert.equal(matchMessage(message({ fromAddress: "news@example.com", subject: "Acmeville newsletter" }), [acme]), null);
  assert.equal(matchMessage(message({ fromAddress: "no-reply@ashbyhq.com", subject: "Update from ACME" }), [acme])?.applicationId, "app-acme");
});

test("mail that names no company it was applied to, or that came before applying, matches nothing", () => {
  assert.equal(matchMessage(message({ fromAddress: "no-reply@greenhouse.io", subject: "Thanks for applying to Initech" }), [acme, globex]), null);
  assert.equal(matchMessage(message({ fromAddress: "jane@acme.io", receivedAt: new Date("2026-10-01T00:00:00Z") }), [acme]), null);
  assert.equal(matchMessage(message({ fromAddress: "friend@gmail.com", subject: "Acme" }), [acme]), null, "a name alone from a stranger's address is not enough");
});

test("between two applications at one company, the job title decides, and without it the match is low confidence on the latest", () => {
  const titled = matchMessage(message({ fromAddress: "jane@acme.io", subject: "Senior Backend Engineer: next steps" }), [acme, acme2]);
  assert.deepEqual([titled?.applicationId, titled?.confidence], ["app-acme", "HIGH"]);
  const untitled = matchMessage(message({ fromAddress: "jane@acme.io", subject: "Next steps" }), [acme, acme2]);
  assert.deepEqual([untitled?.applicationId, untitled?.confidence], ["app-acme-2", "LOW"]);
});
