import { createHash } from "node:crypto";

// Provenance fields stored on every imported job (spec §7 Job: canonicalUrl, contentHash).
// Pure and deterministic so the same posting seen from two sources, or twice from one,
// produces the same values — the cross-source dedupe (JOB-006) compares on these.

const TRACKING_PARAMS = new Set(["gh_src", "ref", "source", "src", "lever-source", "lever-origin"]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

export function canonicalizeJobUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  // URL already lowercases scheme and host and drops a default port.
  parsed.hash = "";
  const kept = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  parsed.search = new URLSearchParams(kept).toString();

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function jobContentHash(input: {
  title: string;
  companyName: string;
  description: string;
}): string {
  const parts = [input.title, input.companyName, input.description].map(normalizeText);
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}
