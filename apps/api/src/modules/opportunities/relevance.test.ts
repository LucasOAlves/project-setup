import assert from "node:assert/strict";
import test from "node:test";
import {
  combineMatchScore,
  isRiskyForPersona,
  recencyScore,
  scoreCandidate,
  sourceQualityScore,
} from "./relevance.ts";

test("prefers recent official sources over popularity-free overlap", () => {
  const now = new Date("2026-08-18T00:00:00Z");
  const strong = scoreCandidate({
    articleId: "11111111-1111-4111-8111-111111111111",
    title: "Kubernetes 1.32 released",
    description: "Official notes",
    source: "Kubernetes",
    url: "https://kubernetes.io/blog/1-32",
    publishedAt: new Date("2026-08-16T00:00:00Z"),
    topics: ["Kubernetes"],
    now,
  });
  const weak = scoreCandidate({
    articleId: "22222222-2222-4222-8222-222222222222",
    title: "Celebrity gossip",
    description: "Unrelated",
    source: "Tabloid",
    url: "https://example.com/celeb",
    publishedAt: new Date("2026-08-18T00:00:00Z"),
    topics: ["Kubernetes"],
    now,
  });

  assert.ok(strong);
  assert.equal(weak, null);
  assert.equal(sourceQualityScore("https://kubernetes.io/blog"), 100);
  assert.ok(recencyScore(new Date("2026-08-17T00:00:00Z"), now) > 80);
  assert.ok(combineMatchScore(80, 40) > 50);
});

test("rejects risky persona topics", () => {
  assert.equal(isRiskyForPersona("Quantum computing hype", ["Quantum computing"]), true);
  assert.equal(isRiskyForPersona("Kubernetes networking", ["Quantum computing"]), false);
});
