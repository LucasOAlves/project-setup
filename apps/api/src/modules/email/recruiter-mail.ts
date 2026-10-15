import type { GmailMessage, GmailMessagePart } from "./gmail-client.js";

// Reading recruiter replies (Milestone 5, ticket 3): which mail to ask Gmail for, how to read a
// message, and which application it is about. Pure functions. Message text is the sender's,
// kept as data and never followed as instructions.

// Domains ATS notification mail comes from, subdomains included (us.greenhouse-mail.io,
// hire.lever.co).
export const ATS_MAIL_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "ashbyhq.com",
  "workablemail.com",
  "workable.com",
  "smartrecruiters.com",
  "myworkday.com",
  "bamboohr.com",
  "recruitee.com",
  "teamtailor.com",
  "jobvite.com",
  "icims.com",
] as const;

const BODY_LIMIT = 20_000;

export type ParsedMessage = {
  providerMessageId: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: Date;
};

export type MatchCandidate = {
  applicationId: string;
  company: string;
  // The company's own mail domain, from its website, or "" when unknown.
  companyDomain: string;
  jobTitle: string;
  submittedAt: Date;
};

export type MessageMatch = { applicationId: string; confidence: "HIGH" | "LOW"; reason: string };

function quoteTerm(value: string): string {
  return value.replace(/["()]/g, "").replace(/\s+/g, " ").trim();
}

// The Gmail search for one run: recent mail, not sent by the user, from an ATS or a company
// applied to, or naming one of those companies in the subject.
export function buildMailQuery(input: { days: number; companyDomains: string[]; companyNames: string[] }): string {
  const domains = [...new Set([...ATS_MAIL_DOMAINS, ...input.companyDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean)])];
  const names = [...new Set(input.companyNames.map(quoteTerm).filter(Boolean))];
  const terms = [...domains.map((domain) => `from:${domain}`), ...names.map((name) => `subject:"${name}"`)];
  return `newer_than:${input.days}d -in:sent -in:chats (${terms.join(" OR ")})`;
}

export function senderDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at > 0 ? address.slice(at + 1).trim().toLowerCase() : "";
}

// "Acme Recruiting <no-reply@acme.io>" or a bare address.
function parseFrom(value: string): { address: string; name: string } {
  const angle = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) return { name: angle[1]!.trim(), address: angle[2]!.trim() };
  return { name: "", address: value.trim() };
}

function decode(data: string | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, name: string) => ENTITIES[name] ?? "");
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

// The first part of a MIME type, depth first. Attachments (a filename) are skipped.
function findPart(part: GmailMessagePart | undefined, mimeType: string): GmailMessagePart | null {
  if (!part || part.filename) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

export function parseGmailMessage(message: GmailMessage): ParsedMessage {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) => headers.find((candidate) => candidate.name.toLowerCase() === name)?.value ?? "";
  const from = parseFrom(header("from"));
  const plain = findPart(message.payload, "text/plain");
  const html = plain ? null : findPart(message.payload, "text/html");
  const body = normalizeText(plain ? decode(plain.body?.data) : html ? htmlToText(decode(html.body?.data)) : "");
  return {
    providerMessageId: message.id,
    fromAddress: from.address,
    fromName: from.name,
    subject: header("subject").trim(),
    body: body.slice(0, BODY_LIMIT),
    receivedAt: new Date(Number(message.internalDate ?? 0)),
  };
}

function isUnder(domain: string, parent: string): boolean {
  return Boolean(parent) && (domain === parent || domain.endsWith(`.${parent}`));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesCompany(text: string, company: string): boolean {
  const name = company.trim();
  if (!name) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

// The application a message is about, or null. It must come from the company's own domain, or
// from an ATS while naming the company, and arrive after the application went out (a day of
// slack for clocks). Between applications at one company the job title decides; without it,
// the latest application is picked with LOW confidence.
export function matchMessage(message: ParsedMessage, candidates: MatchCandidate[]): MessageMatch | null {
  const domain = senderDomain(message.fromAddress);
  const fromAts = ATS_MAIL_DOMAINS.some((ats) => isUnder(domain, ats));
  const text = `${message.fromName}\n${message.subject}\n${message.body}`;
  const eligible = candidates.filter((candidate) => message.receivedAt.getTime() >= candidate.submittedAt.getTime() - 24 * 60 * 60 * 1000);
  const matched = eligible.flatMap((candidate) => {
    if (isUnder(domain, candidate.companyDomain.toLowerCase())) return [{ candidate, reason: "from the company's domain" }];
    if (fromAts && namesCompany(text, candidate.company)) return [{ candidate, reason: "from an ATS, naming the company" }];
    return [];
  });
  if (matched.length === 0) return null;
  if (matched.length === 1) return { applicationId: matched[0]!.candidate.applicationId, confidence: "HIGH", reason: matched[0]!.reason };

  const lower = `${message.subject}\n${message.body}`.toLowerCase();
  const titled = matched.filter(({ candidate }) => candidate.jobTitle && lower.includes(candidate.jobTitle.toLowerCase()));
  if (titled.length === 1) return { applicationId: titled[0]!.candidate.applicationId, confidence: "HIGH", reason: `${titled[0]!.reason}, naming the job` };
  const pool = titled.length > 1 ? titled : matched;
  const latest = [...pool].sort((a, b) => b.candidate.submittedAt.getTime() - a.candidate.submittedAt.getTime())[0]!;
  return { applicationId: latest.candidate.applicationId, confidence: "LOW", reason: `${latest.reason}; more than one application there, picked the latest` };
}
