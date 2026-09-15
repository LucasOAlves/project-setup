import assert from "node:assert/strict";
import test from "node:test";
import { stripMarkdownEmphasis } from "./sanitize-markdown.ts";

test("strips double-asterisk bold, keeping the inner text", () => {
  assert.equal(
    stripMarkdownEmphasis("**Define the task clearly**: do it"),
    "Define the task clearly: do it",
  );
});

test("strips double-underscore bold", () => {
  assert.equal(stripMarkdownEmphasis("this is __important__ work"), "this is important work");
});

test("strips single-asterisk italic bounded by whitespace", () => {
  assert.equal(stripMarkdownEmphasis("this is *subtle* emphasis"), "this is subtle emphasis");
});

test("strips single-underscore italic bounded by whitespace", () => {
  assert.equal(stripMarkdownEmphasis("this is _subtle_ emphasis"), "this is subtle emphasis");
});

test("strips inline code backticks", () => {
  assert.equal(stripMarkdownEmphasis("run `npm test` first"), "run npm test first");
});

test("strips leading heading markers at the start of a line", () => {
  assert.equal(stripMarkdownEmphasis("# Heading\nBody text"), "Heading\nBody text");
  assert.equal(stripMarkdownEmphasis("### Sub-heading"), "Sub-heading");
});

test("strips multiple markers in the same string", () => {
  assert.equal(
    stripMarkdownEmphasis("**bold** and *italic* and `code`"),
    "bold and italic and code",
  );
});

test("does not touch a hyphen inside a normal word", () => {
  assert.equal(stripMarkdownEmphasis("co-authored-by and test-first"), "co-authored-by and test-first");
});

test("does not touch an underscore inside an identifier with no closing pair", () => {
  assert.equal(stripMarkdownEmphasis("the snake_case_var stays"), "the snake_case_var stays");
});

test("leaves plain text with no markdown markers unchanged", () => {
  const text = "Great engineering isn't about hoarding secrets.";
  assert.equal(stripMarkdownEmphasis(text), text);
});

test("is idempotent — running it twice produces the same result", () => {
  const once = stripMarkdownEmphasis("**bold** and *italic*");
  assert.equal(stripMarkdownEmphasis(once), once);
});
