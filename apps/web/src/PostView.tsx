import { useEffect, useState } from "react";
import {
  ANGLE_LABELS,
  ANGLE_TYPES,
  WRITING_TONES,
  type AngleType,
  type PostPublic,
  type WritingTone,
} from "@studio/shared";
import {
  changePostAngle,
  changePostTone,
  fetchPost,
  generateAlternativeHook,
  generatePost,
  rewritePostSection,
  type ApiError,
} from "./api";

const GENERATING_COPY = [
  "Choosing a story strategy…",
  "Drafting from evidence, not from hype…",
  "Reviewing claims, language, and score…",
];

export function PostView() {
  const [post, setPost] = useState<PostPublic | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tone, setTone] = useState<WritingTone>(WRITING_TONES[0]);
  const [angle, setAngle] = useState<AngleType>(ANGLE_TYPES[0]);
  const [section, setSection] = useState("");
  const [stage, setStage] = useState(GENERATING_COPY[0]);

  useEffect(() => {
    let cancelled = false;
    fetchPost()
      .then((existing) => {
        if (!cancelled) {
          setPost(existing);
          if (existing) {
            setTone(existing.tone);
            setAngle(existing.angle);
          }
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

  useEffect(() => {
    if (status !== "generating") {
      return;
    }
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % GENERATING_COPY.length;
      setStage(GENERATING_COPY[index] ?? GENERATING_COPY[0]);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [status]);

  async function run(action: () => Promise<PostPublic>) {
    setError(null);
    setCopied(false);
    setStatus("generating");
    setStage(GENERATING_COPY[0]);
    try {
      const next = await action();
      setPost(next);
      setTone(next.tone);
      setAngle(next.angle);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function copy() {
    if (!post) {
      return;
    }
    await navigator.clipboard.writeText(post.body);
    setCopied(true);
  }

  if (status === "loading") {
    return <p className="empty">Loading post…</p>;
  }

  return (
    <div>
      <p className="lede">
        The post is written from the selected angle and the saved profile. Reviews can cut claims.
        They cannot invent a more impressive career.
      </p>
      {error ? <div className="error">{error}</div> : null}

      {status === "generating" ? <p className="empty">{stage}</p> : null}

      {post && status !== "generating" ? (
        <div className="post-result">
          <p className="eyebrow">
            {ANGLE_LABELS[post.angle]} · {post.tone} · score {post.quality.score}
          </p>
          <p className="post-body">{post.body}</p>
          <p>
            Source:{" "}
            <a href={post.sourceUrl} target="_blank" rel="noreferrer">
              {post.sourceTitle}
            </a>
          </p>

          <div className="bands">
            <div className="band strong">
              <p className="eyebrow">Story</p>
              <p>{post.storyStrategy.structure}</p>
              <p>{post.storyStrategy.takeaway}</p>
            </div>
            <div className="band">
              <p className="eyebrow">Quality</p>
              <p className="score">{post.quality.score}</p>
              <p>{post.quality.explanation}</p>
            </div>
          </div>

          <div className="band">
            <p className="eyebrow">Writing review</p>
            <p>{post.writingReview.summary}</p>
          </div>
          <div className="band">
            <p className="eyebrow">Fact review</p>
            <p>{post.factReview.summary}</p>
            {post.factReview.unsupportedClaims.length > 0 ? (
              <p>
                <strong>Held back.</strong> {post.factReview.unsupportedClaims.join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="band">
            <p className="eyebrow">SEO</p>
            <p>{post.seoReview.summary}</p>
            <p>{post.seoReview.stuffingRisk}</p>
          </div>
        </div>
      ) : null}

      {status === "idle" && !post ? (
        <p className="empty">No post yet. Write one from the selected angle.</p>
      ) : null}

      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={status === "generating"}
          onClick={() => void run(generatePost)}
        >
          {post ? "Regenerate post" : "Write post"}
        </button>
        {post ? (
          <button className="btn ghost" type="button" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy post"}
          </button>
        ) : null}
      </div>

      {post && status !== "generating" ? (
        <div className="post-edits">
          <div className="actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => void run(generateAlternativeHook)}
            >
              Alternative hook
            </button>
          </div>
          <div className="grid-2">
            <label className="field">
              Tone
              <select value={tone} onChange={(event) => setTone(event.target.value as WritingTone)}>
                {WRITING_TONES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Angle
              <select value={angle} onChange={(event) => setAngle(event.target.value as AngleType)}>
                {ANGLE_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {ANGLE_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => void run(() => changePostTone(tone))}
            >
              Apply tone
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => void run(() => changePostAngle(angle))}
            >
              Apply angle
            </button>
          </div>
          <label className="field full">
            Rewrite this section
            <textarea value={section} onChange={(event) => setSection(event.target.value)} />
          </label>
          <button
            className="btn ghost"
            type="button"
            disabled={!section.trim()}
            onClick={() => void run(() => rewritePostSection(section))}
          >
            Rewrite section
          </button>
        </div>
      ) : null}
    </div>
  );
}
