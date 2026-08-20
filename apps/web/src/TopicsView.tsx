import { useEffect, useState } from "react";
import type { ResearchRunPublic } from "@studio/shared";
import { discoverResearch, fetchResearch, type ApiError } from "./api";

export function TopicsView() {
  const [research, setResearch] = useState<ResearchRunPublic | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "discovering">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchResearch()
      .then((existing) => {
        if (!cancelled) {
          setResearch(existing);
          setStatus("idle");
        }
      })
      .catch((err: ApiError) => {
        if (!cancelled) {
          setError(err.message);
          setStatus("idle");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function discover() {
    setError(null);
    setStatus("discovering");
    try {
      setResearch(await discoverResearch());
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  if (status === "loading") {
    return <p className="empty">Loading topics…</p>;
  }

  return (
    <div>
      <p className="lede">
        These are recent events matched to your persona. Trending is not enough. A missing source,
        date, or overlap with your expertise is rejected. Angles and “why this post?” come next.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {research?.queryTopics.length ? (
        <p className="eyebrow">Search: {research.queryTopics.join(" · ")}</p>
      ) : null}

      {status === "discovering" ? (
        <p className="empty">Looking for recent events you can credibly discuss…</p>
      ) : null}

      {research && status !== "discovering" && research.articles.length > 0 ? (
        <div className="article-list">
          {research.articles.map((article) => (
            <article className="article-card" key={article.id}>
              <p className="eyebrow">
                {article.source} · {new Date(article.publishedAt).toLocaleDateString()}
              </p>
              <h3>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
              </h3>
              {article.description ? <p>{article.description}</p> : null}
            </article>
          ))}
        </div>
      ) : null}

      {status === "idle" && research?.emptyReason === "NO_RELEVANT_TOPICS" ? (
        <p className="empty">
          Nothing current was both recent and close enough to your expertise. Try regenerating the
          persona or widening the profile evidence.
        </p>
      ) : null}

      {status === "idle" && !research ? (
        <p className="empty">No discovery yet. Run a search from the saved persona.</p>
      ) : null}

      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={status === "discovering"}
          onClick={() => void discover()}
        >
          {research ? "Discover again" : "Discover current events"}
        </button>
      </div>
    </div>
  );
}
