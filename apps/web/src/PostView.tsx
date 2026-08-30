import { useEffect, useState } from "react";
import {
  ANGLE_LABELS,
  ANGLE_TYPES,
  IMAGE_PROVIDERS,
  IMAGE_PROVIDER_LABELS,
  TEXT_PROVIDERS,
  TEXT_PROVIDER_LABELS,
  WRITING_TONES,
  type AngleType,
  type ExperienceInput,
  type ImageProviderName,
  type ImagePublic,
  type PostPublic,
  type PostSectionComment,
  type TextProviderName,
  type WritingTone,
} from "@studio/shared";
import {
  addExperience,
  applySectionComments,
  changePostAngle,
  changePostTone,
  fetchPost,
  fetchPostById,
  fetchPostImage,
  fetchSelectedOpportunities,
  generateAlternativeHook,
  generateImage,
  generatePost,
  reviewSectionComments,
  type ApiError,
} from "./api";
import { ProviderSelect } from "./ProviderSelect";

type PendingExperienceReview = {
  index: number;
  excerpt: string;
  draft: ExperienceInput;
};

const GENERATING_COPY = [
  "Choosing a story strategy…",
  "Drafting from evidence, not from hype…",
  "Reviewing claims, language, and score…",
];

function splitParagraphs(body: string): string[] {
  const parts = body
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [body];
}

function hasComments(comments: Record<number, string>): boolean {
  return Object.values(comments).some((comment) => comment.trim().length > 0);
}

export function PostView({
  editingPostId,
  onExitEditing,
  onCompareVersions,
}: {
  editingPostId: string | null;
  onExitEditing: () => void;
  onCompareVersions?: (opportunityId: string) => void;
}) {
  const [post, setPost] = useState<PostPublic | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [stalePost, setStalePost] = useState(false);
  const [status, setStatus] = useState<"loading" | "idle" | "generating">("loading");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [image, setImage] = useState<ImagePublic | null>(null);
  const [imageStatus, setImageStatus] = useState<"idle" | "generating">("idle");
  const [imageError, setImageError] = useState<string | null>(null);
  const [tone, setTone] = useState<WritingTone>(WRITING_TONES[0]);
  const [angle, setAngle] = useState<AngleType>(ANGLE_TYPES[0]);
  const [stage, setStage] = useState(GENERATING_COPY[0]);
  const [textProvider, setTextProvider] = useState<TextProviderName | "">("");
  const [imageProvider, setImageProvider] = useState<ImageProviderName | "">("");
  const [openComment, setOpenComment] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [checkingComments, setCheckingComments] = useState(false);
  const [pendingSectionComments, setPendingSectionComments] = useState<PostSectionComment[] | null>(
    null,
  );
  const [pendingExperienceReviews, setPendingExperienceReviews] = useState<
    PendingExperienceReview[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setComments({});
    setOpenComment(null);
    setPendingSectionComments(null);
    setPendingExperienceReviews(null);

    if (editingPostId) {
      fetchPostById(editingPostId)
        .then((existing) => {
          if (cancelled) {
            return;
          }
          setPost(existing);
          setActivePostId(existing?.id ?? null);
          setStalePost(false);
          if (existing) {
            setTone(existing.tone);
            setAngle(existing.angle);
          }
          setStatus("idle");
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
    }

    Promise.all([fetchPost(), fetchSelectedOpportunities()])
      .then(([existing, opportunities]) => {
        if (cancelled) {
          return;
        }
        const matchesSelection =
          existing !== null && existing.opportunityId === opportunities?.selectedOpportunityId;
        setPost(matchesSelection ? existing : null);
        setActivePostId(matchesSelection && existing ? existing.id : null);
        setStalePost(existing !== null && !matchesSelection);
        if (matchesSelection && existing) {
          setTone(existing.tone);
          setAngle(existing.angle);
        }
        setStatus("idle");
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
  }, [editingPostId]);

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

  useEffect(() => {
    let cancelled = false;
    if (!activePostId) {
      setImage(null);
      return;
    }
    fetchPostImage(activePostId)
      .then((existing) => {
        if (!cancelled) {
          setImage(existing);
        }
      })
      .catch(() => {
        // A missing image for this post is not an error state to surface.
      });
    return () => {
      cancelled = true;
    };
  }, [activePostId]);

  async function generateImageNow() {
    setImageError(null);
    setImageStatus("generating");
    try {
      setImage(
        await generateImage(
          activePostId ?? undefined,
          textProvider || undefined,
          imageProvider || undefined,
        ),
      );
    } catch (err) {
      setImageError((err as ApiError).message);
    } finally {
      setImageStatus("idle");
    }
  }

  async function run(action: () => Promise<PostPublic>) {
    setError(null);
    setCopied(false);
    setStatus("generating");
    setStage(GENERATING_COPY[0]);
    try {
      const next = await action();
      setPost(next);
      setActivePostId(next.id);
      setStalePost(false);
      setTone(next.tone);
      setAngle(next.angle);
      setComments({});
      setOpenComment(null);
      setPendingSectionComments(null);
      setPendingExperienceReviews(null);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function startApplyComments() {
    if (!post) {
      return;
    }
    const sectionComments = splitParagraphs(post.body)
      .map((excerpt, index) => ({ excerpt, comment: (comments[index] ?? "").trim() }))
      .filter((item) => item.comment.length > 0);
    if (sectionComments.length === 0) {
      return;
    }

    setError(null);
    setCheckingComments(true);
    try {
      const reviews = await reviewSectionComments(sectionComments, textProvider || undefined);
      const withNewExperience = reviews.filter(
        (item) => item.hasNewExperience && item.draftExperience,
      );
      if (withNewExperience.length > 0) {
        setPendingSectionComments(sectionComments);
        setPendingExperienceReviews(
          withNewExperience.map((item) => ({
            index: item.index,
            excerpt: sectionComments[item.index]?.excerpt ?? "",
            draft: item.draftExperience!,
          })),
        );
      } else {
        void run(() =>
          applySectionComments(sectionComments, activePostId ?? undefined, textProvider || undefined),
        );
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setCheckingComments(false);
    }
  }

  function updateDraftExperience(index: number, patch: Partial<ExperienceInput>) {
    setPendingExperienceReviews((current) =>
      (current ?? []).map((item) =>
        item.index === index ? { ...item, draft: { ...item.draft, ...patch } } : item,
      ),
    );
  }

  function resolvePendingReview(index: number) {
    const next = (pendingExperienceReviews ?? []).filter((item) => item.index !== index);
    setPendingExperienceReviews(next.length > 0 ? next : null);
    if (next.length === 0 && pendingSectionComments) {
      const toApply = pendingSectionComments;
      setPendingSectionComments(null);
      void run(() =>
        applySectionComments(toApply, activePostId ?? undefined, textProvider || undefined),
      );
    }
  }

  async function addReviewToProfile(item: PendingExperienceReview) {
    setError(null);
    try {
      await addExperience(item.draft);
      resolvePendingReview(item.index);
    } catch (err) {
      setError((err as ApiError).message);
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
      {editingPostId ? (
        <div className="notice">
          Editing a saved draft from history. Changes create a new revision — the original stays
          in history unchanged, even if it was already marked published.{" "}
          <button className="btn ghost" type="button" onClick={onExitEditing}>
            Back to current draft
          </button>
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {status === "generating" ? <p className="empty">{stage}</p> : null}

      {post && status !== "generating" ? (
        <div className="post-result">
          <p className="eyebrow">
            {ANGLE_LABELS[post.angle]} · {post.tone} · score {post.quality.score}
          </p>
          <div className="post-body">
            {splitParagraphs(post.body).map((paragraph, index) => (
              <div className="post-paragraph" key={index}>
                <p>{paragraph}</p>
                <button
                  className="btn ghost paragraph-comment-toggle"
                  type="button"
                  onClick={() => setOpenComment(openComment === index ? null : index)}
                >
                  {comments[index]?.trim() ? "Comment ✓" : "Comment"}
                </button>
                {openComment === index ? (
                  <textarea
                    autoFocus
                    value={comments[index] ?? ""}
                    onChange={(event) =>
                      setComments((current) => ({ ...current, [index]: event.target.value }))
                    }
                    placeholder="What should change in this paragraph?"
                  />
                ) : null}
              </div>
            ))}
          </div>
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

          {post.quality.improvements.length > 0 || post.quality.strengths.length > 0 ? (
            <div className="band">
              <p className="eyebrow">To raise the score</p>
              {post.quality.improvements.length > 0 ? (
                <ul className="promise-list">
                  {post.quality.improvements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No specific improvements flagged — comment on a paragraph if you want to push it further.</p>
              )}
              {post.quality.strengths.length > 0 ? (
                <>
                  <p className="eyebrow" style={{ marginTop: 12 }}>
                    Already working
                  </p>
                  <ul className="promise-list">
                    {post.quality.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

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

      {status === "idle" && !post && stalePost ? (
        <div className="notice">
          A different angle is selected now. The previous post was written for another topic —
          write a new one for this selection.
        </div>
      ) : null}
      {status === "idle" && !post && !stalePost ? (
        <p className="empty">No post yet. Write one from the selected angle.</p>
      ) : null}

      <div className="grid-2">
        <ProviderSelect
          label="Text provider"
          value={textProvider}
          onChange={setTextProvider}
          options={TEXT_PROVIDERS}
          labels={TEXT_PROVIDER_LABELS}
        />
      </div>
      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={status === "generating"}
          onClick={() =>
            void run(() =>
              generatePost(
                editingPostId ? post?.opportunityId : undefined,
                textProvider || undefined,
              ),
            )
          }
        >
          {post ? "Regenerate post" : "Write post"}
        </button>
        {post ? (
          <button className="btn ghost" type="button" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy post"}
          </button>
        ) : null}
        {post && onCompareVersions ? (
          <button
            className="btn ghost"
            type="button"
            onClick={() => onCompareVersions(post.opportunityId)}
          >
            Compare versions of this topic
          </button>
        ) : null}
      </div>
      {post && status !== "generating" ? (
        <p className="status">Written with {post.model}</p>
      ) : null}

      {post && status !== "generating" ? (
        <div className="band">
          <p className="eyebrow">Image</p>
          {imageError ? <div className="error">{imageError}</div> : null}
          {imageStatus === "generating" ? (
            <p className="empty">Art-directing a supporting image…</p>
          ) : null}
          {image && imageStatus !== "generating" ? (
            <img
              src={image.url}
              alt="Generated visual for this post"
              style={{ maxWidth: "100%", borderRadius: 12, display: "block", marginBottom: 12 }}
            />
          ) : null}
          {image && imageStatus !== "generating" ? (
            <p className="status">Generated with {image.model}</p>
          ) : null}
          {!image && imageStatus !== "generating" ? (
            <p className="empty">No image yet.</p>
          ) : null}
          <div className="grid-2">
            <ProviderSelect
              label="Image provider"
              value={imageProvider}
              onChange={setImageProvider}
              options={IMAGE_PROVIDERS}
              labels={IMAGE_PROVIDER_LABELS}
            />
          </div>
          <div className="actions">
            <button
              className="btn ghost"
              type="button"
              disabled={imageStatus === "generating"}
              onClick={() => void generateImageNow()}
            >
              {image ? "Retry image" : "Generate image"}
            </button>
          </div>
        </div>
      ) : null}

      {post && status !== "generating" ? (
        <div className="post-edits">
          <div className="actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() =>
                void run(() =>
                  generateAlternativeHook(activePostId ?? undefined, textProvider || undefined),
                )
              }
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
              onClick={() =>
                void run(() =>
                  changePostTone(tone, activePostId ?? undefined, textProvider || undefined),
                )
              }
            >
              Apply tone
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() =>
                void run(() =>
                  changePostAngle(angle, activePostId ?? undefined, textProvider || undefined),
                )
              }
            >
              Apply angle
            </button>
          </div>
          <p className="empty">
            Click "Comment" under any paragraph above to say what should change in it, then apply
            every comment together.
          </p>
          {!pendingExperienceReviews ? (
            <button
              className="btn ghost"
              type="button"
              disabled={!hasComments(comments) || checkingComments}
              onClick={() => void startApplyComments()}
            >
              {checkingComments ? "Checking comments for new experience…" : "Apply comments"}
            </button>
          ) : null}

          {pendingExperienceReviews ? (
            <div className="notice">
              <p>
                One or more comments describe experience that isn't in your profile yet. Review
                each before the post is rewritten — add it to your profile, or skip and the
                comment will apply without that claim.
              </p>
              {pendingExperienceReviews.map((item) => (
                <article className="experience-card" key={item.index}>
                  <p className="eyebrow">From your comment on: "{item.excerpt}"</p>
                  <div className="grid-2">
                    <label className="field">
                      Role
                      <input
                        value={item.draft.role}
                        onChange={(event) =>
                          updateDraftExperience(item.index, { role: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Company
                      <input
                        value={item.draft.company}
                        onChange={(event) =>
                          updateDraftExperience(item.index, { company: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="field full">
                    Description
                    <textarea
                      value={item.draft.description}
                      onChange={(event) =>
                        updateDraftExperience(item.index, { description: event.target.value })
                      }
                    />
                  </label>
                  <label className="field full">
                    Achievements
                    <textarea
                      value={item.draft.achievements}
                      onChange={(event) =>
                        updateDraftExperience(item.index, { achievements: event.target.value })
                      }
                    />
                  </label>
                  <label className="field full">
                    Measurable outcomes
                    <textarea
                      value={item.draft.measurableOutcomes}
                      onChange={(event) =>
                        updateDraftExperience(item.index, {
                          measurableOutcomes: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="actions">
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => void addReviewToProfile(item)}
                    >
                      Add to profile
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => resolvePendingReview(item.index)}
                    >
                      Skip
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
