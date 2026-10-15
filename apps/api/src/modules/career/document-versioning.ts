import { createHash } from "node:crypto";

// Versioning for generated application documents (Milestone 2). Each saved version is
// immutable; a new one is added only when the content differs from the latest version of the
// same document for the same job, so generating twice from unchanged inputs is a no-op.

// JSON with object keys sorted at every depth; undefined fields are dropped like JSON.stringify.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function documentContentHash(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export type NextDocumentVersion = { action: "CREATE" | "UNCHANGED"; version: number };

export function nextDocumentVersion(
  latest: { version: number; contentHash: string } | null,
  contentHash: string,
): NextDocumentVersion {
  if (!latest) return { action: "CREATE", version: 1 };
  if (latest.contentHash === contentHash) return { action: "UNCHANGED", version: latest.version };
  return { action: "CREATE", version: latest.version + 1 };
}
