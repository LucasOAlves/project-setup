import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { NewsApiNewsProvider, normalizeNewsApiArticle } from "./newsapi-adapter.ts";

test("drops articles without url date or source", () => {
  assert.equal(
    normalizeNewsApiArticle({ title: "Release", url: "not-a-url", source: { name: "AWS" } }, [
      "AWS",
    ]),
    null,
  );
  assert.ok(
    normalizeNewsApiArticle(
      {
        title: "EKS now supports something",
        description: "A real announcement",
        url: "https://aws.amazon.com/blogs/eks",
        publishedAt: "2026-08-01T00:00:00Z",
        source: { name: "AWS" },
      },
      ["EKS"],
    ),
  );
});

test("maps credential failure without inventing articles", async () => {
  const provider = new NewsApiNewsProvider("bad", async () =>
    new Response(JSON.stringify({ status: "error", code: "apiKeyInvalid" }), { status: 401 }),
  );

  await assert.rejects(
    () =>
      provider.searchNews({
        topics: ["Kubernetes"],
        from: new Date("2026-08-01"),
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});

test("normalizes a NewsAPI payload into the internal model", async () => {
  const provider = new NewsApiNewsProvider("key", async () =>
    new Response(
      JSON.stringify({
        status: "ok",
        articles: [
          {
            title: "Kubernetes 1.32",
            description: "Release notes",
            url: "https://kubernetes.io/blog/1-32",
            publishedAt: "2026-08-10T12:00:00Z",
            source: { name: "Kubernetes" },
          },
        ],
      }),
    ),
  );

  const articles = await provider.searchNews({
    topics: ["Kubernetes"],
    from: new Date("2026-08-01"),
  });
  assert.equal(articles[0]?.provider, "newsapi");
  assert.equal(articles[0]?.url, "https://kubernetes.io/blog/1-32");
  assert.equal(articles[0]?.title, "Kubernetes 1.32");
});
