// Redaction for technical logs and audit payloads (spec §6 Privacy: "Redact personal
// identifiers from technical logs"). Key-based for structured fields, pattern-based only for
// email addresses in free text — phone numbers and names in prose are too ambiguous to
// match reliably, so callers must not log raw prose that may contain them.

const SENSITIVE_KEYS = new Set([
  "email",
  "phone",
  "fullname",
  "password",
  "token",
  "apikey",
  "authorization",
  "cookie",
  "secret",
  "linkedinurl",
]);

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""));
}

function redactValue(value: unknown, ancestors: object[]): unknown {
  if (typeof value === "string") return value.replace(EMAIL_PATTERN, "[EMAIL]");
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (ancestors.includes(value)) return "[CIRCULAR]";

  const path = [...ancestors, value];
  if (value instanceof Error) {
    return { name: value.name, message: redactValue(value.message, path) };
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, path));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(inner, path);
  }
  return out;
}

export function redact(value: unknown): unknown {
  return redactValue(value, []);
}
