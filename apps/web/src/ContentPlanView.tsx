import { useEffect, useRef, useState } from "react";
import {
  CONTENT_PLAN_STATUSES,
  TEXT_PROVIDERS,
  TEXT_PROVIDER_LABELS,
  type ContentPlanStatus,
  type ContentPlanTopic,
  type ContentPlanTopicPublic,
  type TextProviderName,
} from "@studio/shared";
import {
  extractPlanDocument,
  fetchContentPlan,
  savePlanTopics,
  selectContentPlanTopic,
  updateContentPlanTopicStatus,
  type ApiError,
} from "./api";
import { ProviderSelect } from "./ProviderSelect";

const STATUS_LABELS: Record<ContentPlanStatus, string> = {
  PLANNED: "Planned",
  SELECTED: "Selected",
  DRAFTED: "Drafted",
  PUBLISHED: "Published",
  SKIPPED: "Skipped",
};

export function ContentPlanView({ onSelected }: { onSelected: () => void }) {
  const [topics, setTopics] = useState<ContentPlanTopicPublic[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "selecting">("loading");
  const [error, setError] = useState<string | null>(null);
  const [uploadProvider, setUploadProvider] = useState<TextProviderName | "">("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "extracting" | "saving">("idle");
  const [draftTopics, setDraftTopics] = useState<ContentPlanTopic[] | null>(null);
  const [draftFilename, setDraftFilename] = useState<string>("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchContentPlan()
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

  async function use(topicId: string) {
    setError(null);
    setStatus("selecting");
    try {
      await selectContentPlanTopic(topicId);
      setTopics(await fetchContentPlan());
      onSelected();
    } catch (err) {
      setError((err as ApiError).message);
      setStatus("idle");
      return;
    }
    setStatus("idle");
  }

  async function onExtractPlan(file: File) {
    setError(null);
    setUploadStatus("extracting");
    try {
      const extracted = await extractPlanDocument(file, uploadProvider || undefined);
      setDraftTopics(extracted);
      setDraftFilename(file.name);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploadStatus("idle");
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  }

  async function onUsePlan() {
    if (!draftTopics) return;
    setError(null);
    setUploadStatus("saving");
    try {
      setTopics(await savePlanTopics(draftTopics, draftFilename));
      setDraftTopics(null);
      setDraftFilename("");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploadStatus("idle");
    }
  }

  function onDiscardDraft() {
    setDraftTopics(null);
    setDraftFilename("");
  }

  async function markStatus(topicId: string, next: ContentPlanStatus) {
    setError(null);
    try {
      setTopics(await updateContentPlanTopicStatus(topicId, next));
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  if (status === "loading") {
    return <p className="empty">Loading content plan…</p>;
  }

  const byWeek = new Map<number, ContentPlanTopicPublic[]>();
  for (const topic of topics) {
    const bucket = byWeek.get(topic.week) ?? [];
    bucket.push(topic);
    byWeek.set(topic.week, bucket);
  }

  return (
    <div>
      <p className="lede">
        A pre-approved 12-week, 24-post calendar. Picking a topic writes a post grounded in its
        brief — key points, hook, and CTA — instead of a discovered news article.
      </p>
      <div className="notice">
        Confidentiality reminder: use only invented, synthetic, or fully abstract examples. Never
        publish names, screenshots, code, queries, identifiers, volumes, dates, incidents,
        diagrams, business rules, or figures traceable to an organization.
      </div>
      {error ? <div className="error">{error}</div> : null}

      <div className="notice">
        <p>
          Upload your own plan (PDF) to replace the example topics below. Nothing is saved until
          you review the preview and click Use this plan.
        </p>
        <div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
          <input
            ref={uploadInputRef}
            type="file"
            accept="application/pdf"
            disabled={uploadStatus === "extracting"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onExtractPlan(file);
            }}
          />
          <ProviderSelect
            label="Text provider"
            value={uploadProvider}
            onChange={setUploadProvider}
            options={TEXT_PROVIDERS}
            labels={TEXT_PROVIDER_LABELS}
          />
        </div>
        {uploadStatus === "extracting" ? (
          <p className="status">Reading the document…</p>
        ) : null}
      </div>

      {draftTopics ? (
        <section className="panel">
          <p className="eyebrow">Preview · {draftFilename}</p>
          <h3>{draftTopics.length} topics found</h3>
          <div className="article-list">
            {draftTopics.map((topic) => (
              <article className="article-card" key={topic.id}>
                <p className="eyebrow">
                  {topic.id} · week {topic.week} · {topic.format}
                </p>
                <h3>{topic.title}</h3>
                <p>{topic.pillar}</p>
              </article>
            ))}
          </div>
          <div className="actions">
            <button
              className="btn primary"
              type="button"
              disabled={uploadStatus === "saving"}
              onClick={() => void onUsePlan()}
            >
              Use this plan
            </button>
            <button className="btn ghost" type="button" onClick={onDiscardDraft}>
              Discard
            </button>
          </div>
        </section>
      ) : null}

      {[...byWeek.entries()]
        .sort(([left], [right]) => left - right)
        .map(([week, weekTopics]) => (
          <section key={week}>
            <p className="eyebrow" style={{ marginTop: 20 }}>
              Week {week}
            </p>
            <div className="article-list">
              {weekTopics.map((topic) => (
                <article
                  className={
                    topic.status === "PLANNED" ? "article-card" : "article-card selected"
                  }
                  key={topic.id}
                >
                  <p className="eyebrow">
                    {topic.id} · {new Date(topic.date).toLocaleDateString()} · {topic.format} ·
                    priority {topic.priority.toFixed(1)}
                  </p>
                  <h3>{topic.title}</h3>
                  <p>{topic.pillar}</p>
                  <p>
                    <strong>Hook.</strong> {topic.hook}
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
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
