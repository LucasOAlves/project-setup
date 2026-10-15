import assert from "node:assert/strict";
import test from "node:test";
import { automaticSourcesAreKnown, isTalentPlatform, JOB_SITES } from "./job-sites.ts";

test("the catalog has every site on the list once, plus Himalayas", () => {
  assert.equal(JOB_SITES.length, 44);
  assert.equal(new Set(JOB_SITES.map((site) => site.id)).size, JOB_SITES.length);
});

test("every site has an https URL without tracking parameters", () => {
  for (const site of JOB_SITES) {
    const url = new URL(site.url);
    assert.equal(url.protocol, "https:", site.id);
    assert.ok(![...url.searchParams.keys()].some((key) => /^(utm_|gclid|gad_|hsa_|cq_)/.test(key)), site.id);
  }
});

test("automatic sites name a real search adapter", () => {
  assert.equal(automaticSourcesAreKnown(), true);
});

test("only talent platforms take a profile status", () => {
  assert.equal(isTalentPlatform("turing"), true);
  assert.equal(isTalentPlatform("wellfound"), false);
  assert.equal(isTalentPlatform("nope"), false);
});
