import { useEffect, useState } from "react";
import {
  ANGLE_LABELS,
  POST_OUTCOMES,
  POST_STATUSES,
  type PostHistoryQuery,
  type PostOutcome,
  type PostPublic,
  type PostStatus,
} from "@studio/shared";
import { fetchPostHistory, updatePostTracking, type ApiError } from "./api";

const SORT_OPTIONS: Array<{ label: string; sortBy: PostHistoryQuery["sortBy"]; sortDir: "asc" | "desc" }> = [
  { label: "Newest", sortBy: "createdAt", sortDir: "desc" },
  { label: "Oldest", sortBy: "createdAt", sortDir: "asc" },
  { label: "Score high to low", sortBy: "score", sortDir: "desc" },
  { label: "Score low to high", sortBy: "score", sortDir: "asc" },
  { label: "Status", sortBy: "status", sortDir: "asc" },
];

const OUTCOME_LABELS: Record<PostOutcome, string> = {
  GOOD: "Good",
  NEUTRAL: "Neutral",
  POOR: "Poor",
};

const STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

const PAGE_SIZE = 10;

export function PostHistoryView({
  onEdit,
  opportunityId,
  onClearFilter,
}: {
  onEdit: (postId: string) => void;
  opportunityId?: string;
  onClearFilter?: () => void;
}) {
  const [posts, setPosts] = useState<PostPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [sortIndex, setSortIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "idle">("loading");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const sort = SORT_OPTIONS[sortIndex] ?? SORT_OPTIONS[0]!;
    fetchPostHistory({
      page,
      pageSize: PAGE_SIZE,
      q: search || undefined,
      sortBy: sort.sortBy,
      sortDir: sort.sortDir,
      opportunityId,
    })
      .then((result) => {
        if (!cancelled) {
          setPosts(result.posts);
          setTotal(result.total);
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
  }, [page, search, sortIndex, opportunityId]);

  function submitSearch() {
    setPage(1);
    setSearch(queryText.trim());
  }

  async function saveTracking(
    id: string,
    patch: { status?: PostStatus; outcome?: PostOutcome | null; outcomeNotes?: string | null },
  ) {
    setError(null);
    try {
      const updated = await updatePostTracking(id, patch);
      setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {opportunityId ? (
        <div className="notice">
          {status === "loading" ? "Loading versions…" : `${total} version${total === 1 ? "" : "s"} of this topic.`}{" "}
          {onClearFilter ? (
            <button className="btn ghost" type="button" onClick={onClearFilter}>
              Show all history
            </button>
          ) : null}
        </div>
      ) : (
        <p className="lede">
          Every post ever generated, oldest to newest or however you sort it. Track what you
          published and how it went.
        </p>
      )}
      {error ? <div className="error">{error}</div> : null}

      <div className="grid-2">
        {opportunityId ? null : (
          <label className="field">
            Search
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search hook and body"
            />
          </label>
        )}
        <label className="field">
          Sort
          <select
            value={sortIndex}
            onChange={(event) => {
              setSortIndex(Number(event.target.value));
              setPage(1);
            }}
          >
            {SORT_OPTIONS.map((option, index) => (
              <option key={option.label} value={index}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {opportunityId ? null : (
        <div className="actions">
          <button className="btn ghost" type="button" onClick={submitSearch}>
            Apply search
          </button>
        </div>
      )}

      {status === "loading" ? <p className="empty">Loading history…</p> : null}

      {status === "idle" && posts.length === 0 ? (
        <p className="empty">
          {opportunityId ? "No versions yet for this topic." : "No posts match this search yet."}
        </p>
      ) : null}

      {status === "idle" && posts.length > 0 ? (
        <div className="article-list">
          {posts.map((post) => {
            const expanded = expandedId === post.id;
            return (
              <article className="article-card" key={post.id}>
                <p className="eyebrow">
                  {new Date(post.createdAt).toLocaleString()} · {ANGLE_LABELS[post.angle]} ·{" "}
                  {post.tone} · score {post.quality.score} · {STATUS_LABELS[post.status]}
                  {post.outcome ? ` · ${OUTCOME_LABELS[post.outcome]}` : ""}
                </p>
                <h3>{post.sourceTitle || post.hook}</h3>
                <div className="actions">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : post.id)}
                  >
                    {expanded ? "Collapse" : "View and track"}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => onEdit(post.id)}>
                    Edit this post
                  </button>
                </div>

                {expanded ? (
                  <div>
                    <p className="post-body">{post.body}</p>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(post.body)}
                    >
                      Copy post
                    </button>

                    <div className="grid-2" style={{ marginTop: 16 }}>
                      <label className="field">
                        Status
                        <select
                          value={post.status}
                          onChange={(event) =>
                            void saveTracking(post.id, { status: event.target.value as PostStatus })
                          }
                        >
                          {POST_STATUSES.map((option) => (
                            <option key={option} value={option}>
                              {STATUS_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Outcome
                        <select
                          value={post.outcome ?? ""}
                          onChange={(event) =>
                            void saveTracking(post.id, {
                              outcome: event.target.value ? (event.target.value as PostOutcome) : null,
                            })
                          }
                        >
                          <option value="">Not rated</option>
                          {POST_OUTCOMES.map((option) => (
                            <option key={option} value={option}>
                              {OUTCOME_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field full">
                      Notes
                      <textarea
                        defaultValue={post.outcomeNotes ?? ""}
                        onBlur={(event) =>
                          void saveTracking(post.id, { outcomeNotes: event.target.value || null })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {total > PAGE_SIZE ? (
        <div className="actions">
          <button
            className="btn ghost"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <p className="status">
            Page {page} of {totalPages}
          </p>
          <button
            className="btn ghost"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
