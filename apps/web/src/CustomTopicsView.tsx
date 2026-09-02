import { useEffect, useState } from "react";
import {
  ANGLE_LABELS,
  ANGLE_TYPES,
  CONTENT_PLAN_STATUSES,
  type AngleType,
  type ContentPlanStatus,
  type CustomTopicPublic,
} from "@studio/shared";
import {
  createCustomTopic,
  deleteCustomTopic,
  fetchCustomTopics,
  selectCustomTopic,
  updateCustomTopicStatus,
  type ApiError,
} from "./api";
import { TagInput } from "./TagInput";

const STATUS_LABELS: Record<ContentPlanStatus, string> = {
  PLANNED: "Planned",
  SELECTED: "Selected",
  DRAFTED: "Drafted",
  PUBLISHED: "Published",
  SKIPPED: "Skipped",
};

const emptyForm = () => ({
  title: "",
  hook: "",
  objective: "",
  keyPoints: [] as string[],
  cta: "",
  angle: ANGLE_TYPES[0] as AngleType,
  pillar: "",
  sourceUrl: "",
});

export type CustomTopicDraft = { hook: string; pillar: string; keyPoint: string };

export function CustomTopicsView({
  onSelected,
  initialDraft,
  onDraftApplied,
}: {
  onSelected: () => void;
  initialDraft?: CustomTopicDraft | null;
  onDraftApplied?: () => void;
}) {
  const [topics, setTopics] = useState<CustomTopicPublic[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "selecting">("loading");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (!initialDraft) return;
    setForm((current) => ({
      ...current,
      hook: initialDraft.hook,
      pillar: initialDraft.pillar,
      keyPoints: [initialDraft.keyPoint],
    }));
    onDraftApplied?.();
    // Only ever apply a draft when the object identity actually changes — App.tsx clears it
    // to null right after handing it off, so this cannot re-apply on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  useEffect(() => {
    let cancelled = false;
    fetchCustomTopics()
      .then((existing) => {
        if (!cancelled) {
          setTopics(existing);
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

  async function submit() {
    setError(null);
    if (!form.title.trim() || !form.hook.trim() || form.keyPoints.length === 0) {
      setError("Give the topic a title, a hook, and at least one key point.");
      return;
    }
    setStatus("saving");
    try {
      await createCustomTopic({
        title: form.title.trim(),
        hook: form.hook.trim(),
        objective: form.objective.trim() || undefined,
        keyPoints: form.keyPoints,
        cta: form.cta.trim() || undefined,
        angle: form.angle,
        pillar: form.pillar.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
      });
      setTopics(await fetchCustomTopics());
      setForm(emptyForm());
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function use(id: string) {
    setError(null);
    setStatus("selecting");
    try {
      await selectCustomTopic(id);
      setTopics(await fetchCustomTopics());
      onSelected();
    } catch (err) {
      setError((err as ApiError).message);
      setStatus("idle");
      return;
    }
    setStatus("idle");
  }

  async function remove(id: string) {
    setError(null);
    try {
      setTopics(await deleteCustomTopic(id));
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function markStatus(id: string, next: ContentPlanStatus) {
    setError(null);
    try {
      setTopics(await updateCustomTopicStatus(id, next));
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  if (status === "loading") {
    return <p className="empty">Loading your topics…</p>;
  }

  return (
    <div>
      <p className="lede">
        Not from the calendar, not from the news — an idea you already have. It writes a post
        grounded in exactly what you type below, the same way Content Plan and Discover News do.
      </p>
      {error ? <div className="error">{error}</div> : null}

      <div className="grid-2">
        <label className="field">
          Title
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>
        <label className="field">
          Angle
          <select
            value={form.angle}
            onChange={(event) => setForm({ ...form, angle: event.target.value as AngleType })}
          >
            {ANGLE_TYPES.map((item) => (
              <option key={item} value={item}>
                {ANGLE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          Hook
          <textarea
            value={form.hook}
            onChange={(event) => setForm({ ...form, hook: event.target.value })}
          />
        </label>
        <label className="field full">
          Key points
          <TagInput
            values={form.keyPoints}
            onChange={(keyPoints) => setForm({ ...form, keyPoints })}
          />
        </label>
        <label className="field">
          Objective (optional)
          <input
            value={form.objective}
            onChange={(event) => setForm({ ...form, objective: event.target.value })}
          />
        </label>
        <label className="field">
          Call to action (optional)
          <input
            value={form.cta}
            onChange={(event) => setForm({ ...form, cta: event.target.value })}
          />
        </label>
        <label className="field">
          Pillar / category (optional)
          <input
            value={form.pillar}
            onChange={(event) => setForm({ ...form, pillar: event.target.value })}
          />
        </label>
        <label className="field">
          Source link (optional)
          <input
            value={form.sourceUrl}
            onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
            placeholder="https://…"
          />
        </label>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          type="button"
          disabled={status === "saving"}
          onClick={() => void submit()}
        >
          Add topic
        </button>
      </div>

      {topics.length === 0 ? (
        <p className="empty">No custom topics yet. Add one above.</p>
      ) : (
        <div className="article-list">
          {topics.map((topic) => (
            <article
              className={topic.status === "PLANNED" ? "article-card" : "article-card selected"}
              key={topic.id}
            >
              <p className="eyebrow">
                {ANGLE_LABELS[topic.angle]}
                {topic.pillar ? ` · ${topic.pillar}` : ""}
              </p>
              <h3>{topic.title}</h3>
              <p>
                <strong>Hook.</strong> {topic.hook}
              </p>
              <p>
                <strong>Key points.</strong> {topic.keyPoints.join(" · ")}
              </p>
              <div className="actions">
                <button
                  className="btn primary"
                  type="button"
                  disabled={status === "selecting"}
                  onClick={() => void use(topic.id)}
                >
                  {topic.status === "PLANNED" ? "Use this topic" : "Regenerate from this topic"}
                </button>
                <select
                  value={topic.status}
                  onChange={(event) =>
                    void markStatus(topic.id, event.target.value as ContentPlanStatus)
                  }
                >
                  {CONTENT_PLAN_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {STATUS_LABELS[option]}
                    </option>
                  ))}
                </select>
                <button className="btn ghost" type="button" onClick={() => void remove(topic.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
