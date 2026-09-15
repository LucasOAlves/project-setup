// LinkedIn does not render Markdown — a post published with "**bold**" shows
// the literal asterisks, not bold text (real emphasis there is a Unicode
// character trick, see apps/web/src/text-format.ts). The post-writing prompts
// now say not to use Markdown, but a model can still slip a marker in; this
// is the deterministic second layer that strips one out if it does.

// Bold markers (**text** / __text__) — always a matched pair, so a plain
// greedy-but-lazy match between two markers is unambiguous.
const BOLD_STAR = /\*\*([^*]+)\*\*/g;
const BOLD_UNDERSCORE = /__([^_]+)__/g;

// Italic markers (*text* / _text_) — only stripped when whitespace- or
// string-boundary-delimited, so "co-authored-by" and "snake_case_var" (real
// punctuation/identifiers, not emphasis) are left untouched.
const ITALIC_STAR = /(^|\s)\*([^\s*][^*]*?)\*(?=\s|$)/g;
const ITALIC_UNDERSCORE = /(^|\s)_([^\s_][^_]*?)_(?=\s|$)/g;

const INLINE_CODE = /`([^`]+)`/g;
const HEADING_MARKER = /^#{1,6}\s+/gm;

export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(HEADING_MARKER, "")
    .replace(BOLD_STAR, "$1")
    .replace(BOLD_UNDERSCORE, "$1")
    .replace(ITALIC_STAR, "$1$2")
    .replace(ITALIC_UNDERSCORE, "$1$2")
    .replace(INLINE_CODE, "$1");
}
