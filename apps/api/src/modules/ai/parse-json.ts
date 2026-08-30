import { malformedAiOutput } from "../../app-error.js";

// Models occasionally emit a raw, unescaped control character (most often a literal
// newline) inside a JSON string value instead of the escaped `\n` two-character
// sequence. That's illegal per RFC 8259 and JSON.parse rejects it outright. Since
// insignificant whitespace between tokens is also just raw control characters, it's
// safe to normalize every raw control byte to a single space before parsing: valid
// JSON is unaffected (whitespace between tokens), and the rare unescaped-newline
// case degrades to a readable joined string instead of a hard parse failure.
function sanitizeControlCharacters(raw: string): string {
  let result = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x00 && code <= 0x1f) {
      result += " ";
    } else {
      result += char;
    }
  }
  return result;
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = sanitizeControlCharacters((fenced?.[1] ?? trimmed).trim());

  try {
    return JSON.parse(raw);
  } catch {
    throw malformedAiOutput("The model did not return valid JSON.");
  }
}
