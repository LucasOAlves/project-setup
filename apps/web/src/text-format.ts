// LinkedIn has no real rich-text formatting. "Bold"/"italic" text there is
// actually a different Unicode block (Mathematical Alphanumeric Symbols) —
// each styled letter is a distinct character, not a style applied to a
// normal one. That's why it survives copy/paste into any plain-text field.

export type TextStyle = "bold" | "italic";

const UPPER_A = "A".codePointAt(0)!;
const UPPER_Z = "Z".codePointAt(0)!;
const LOWER_A = "a".codePointAt(0)!;
const LOWER_Z = "z".codePointAt(0)!;
const DIGIT_0 = "0".codePointAt(0)!;
const DIGIT_9 = "9".codePointAt(0)!;

// Sans-serif variants (not the plainer serif "Mathematical Bold/Italic" block)
// — closer to LinkedIn's own UI font, and what the common "LinkedIn bold text"
// generator tools produce, so pasted text looks native rather than out of place.
const BOLD_UPPER_START = 0x1d5d4;
const BOLD_LOWER_START = 0x1d5ee;
const BOLD_DIGIT_START = 0x1d7ec;

const ITALIC_UPPER_START = 0x1d608;
const ITALIC_LOWER_START = 0x1d622;

// Re-styling already-styled text (e.g. italicizing a phrase that was bolded a
// moment ago) needs to start from the plain letter, not the styled codepoint
// — otherwise a styled character falls through every range check below and
// is left untouched, silently no-op'ing the second style.
function toPlainChar(ch: string): string {
  const code = ch.codePointAt(0);
  if (code === undefined) {
    return ch;
  }
  if (code >= BOLD_UPPER_START && code < BOLD_UPPER_START + 26) {
    return String.fromCharCode(UPPER_A + (code - BOLD_UPPER_START));
  }
  if (code >= BOLD_LOWER_START && code < BOLD_LOWER_START + 26) {
    return String.fromCharCode(LOWER_A + (code - BOLD_LOWER_START));
  }
  if (code >= BOLD_DIGIT_START && code < BOLD_DIGIT_START + 10) {
    return String.fromCharCode(DIGIT_0 + (code - BOLD_DIGIT_START));
  }
  if (code >= ITALIC_UPPER_START && code < ITALIC_UPPER_START + 26) {
    return String.fromCharCode(UPPER_A + (code - ITALIC_UPPER_START));
  }
  if (code >= ITALIC_LOWER_START && code < ITALIC_LOWER_START + 26) {
    return String.fromCharCode(LOWER_A + (code - ITALIC_LOWER_START));
  }
  return ch;
}

function mapChar(input: string, style: TextStyle): string {
  const ch = toPlainChar(input);
  const code = ch.codePointAt(0);
  if (code === undefined) {
    return ch;
  }

  if (code >= UPPER_A && code <= UPPER_Z) {
    const offset = code - UPPER_A;
    return String.fromCodePoint(
      (style === "bold" ? BOLD_UPPER_START : ITALIC_UPPER_START) + offset,
    );
  }

  if (code >= LOWER_A && code <= LOWER_Z) {
    const offset = code - LOWER_A;
    return String.fromCodePoint(
      (style === "bold" ? BOLD_LOWER_START : ITALIC_LOWER_START) + offset,
    );
  }

  // No italic digit block exists in Unicode — digits stay plain under italic.
  if (style === "bold" && code >= DIGIT_0 && code <= DIGIT_9) {
    return String.fromCodePoint(BOLD_DIGIT_START + (code - DIGIT_0));
  }

  // Accents, punctuation, spaces, and non-Latin letters have no styled
  // counterpart here — leave them exactly as typed rather than dropping them.
  return ch;
}

function mapText(text: string, style: TextStyle): string {
  return Array.from(text)
    .map((ch) => mapChar(ch, style))
    .join("");
}

export function toBold(text: string): string {
  return mapText(text, "bold");
}

export function toItalic(text: string): string {
  return mapText(text, "italic");
}

// `start`/`end` are UTF-16 code-unit offsets — the same unit both native
// string slicing and the DOM Selection/Range API use. Styled characters are
// astral codepoints (2 units each), so an offset captured before styling is
// no longer valid after; always source start/end from a fresh selection (or
// fresh length measurement) against the *current* text, never a cached one.
export function applyStyleToRange(
  text: string,
  start: number,
  end: number,
  style: TextStyle,
): string {
  if (start < 0 || end > text.length || start >= end) {
    return text;
  }
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  return before + mapText(selected, style) + after;
}
