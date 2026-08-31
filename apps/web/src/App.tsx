import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  POSITIONING_OPTIONS,
  POST_LENGTHS,
  TEXT_PROVIDERS,
  TEXT_PROVIDER_LABELS,
  WRITING_TONES,
  type ProfileInput,
  type ProfilePublic,
  type TextProviderName,
} from "@studio/shared";
import { ContentPlanView } from "./ContentPlanView";
import { CustomTopicsView } from "./CustomTopicsView";
import { DiscoverView } from "./DiscoverView";
import { DocsView } from "./DocsView";
import { PersonaView } from "./PersonaView";
import { PostHistoryView } from "./PostHistoryView";
import { PostView } from "./PostView";
import { ProviderSelect } from "./ProviderSelect";
import { TagInput } from "./TagInput";
import {
  deletePhoto,
  downloadResumePdf,
  emptyProfile,
  extractResumeDraft,
  fetchProfile,
  saveProfile,
  uploadPhoto,
  type ApiError,
} from "./api";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "identity", label: "Identity" },
  { id: "experience", label: "Experience" },
  { id: "positioning", label: "Positioning" },
  { id: "writing", label: "Writing" },
  { id: "photos", label: "Photos" },
  { id: "persona", label: "Persona" },
  { id: "plan", label: "Content plan" },
  { id: "custom", label: "My topics" },
  { id: "discover", label: "Discover news" },
  { id: "post", label: "Post" },
  { id: "history", label: "History" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function App() {
  const [step, setStep] = useState<StepId>("welcome");
  const [profile, setProfile] = useState<ProfileInput>(emptyProfile);
  const [saved, setSaved] = useState<ProfilePublic | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "uploading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [compareOpportunityId, setCompareOpportunityId] = useState<string | null>(null);
  const [resumeProvider, setResumeProvider] = useState<TextProviderName | "">("");
  const [resumeStatus, setResumeStatus] = useState<"idle" | "extracting">("idle");
  const resumeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setSaved(existing);
          setProfile(existing);
        }
        setStatus("idle");
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setError(err.message);
        setStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  async function persist(nextStep?: StepId) {
    setError(null);
    setStatus("saving");
    try {
      const result = await saveProfile(profile);
      setSaved(result);
      setProfile({ ...result });
      if (nextStep) setStep(nextStep);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function onUpload(file: File) {
    setError(null);
    setStatus("uploading");
    try {
      await saveProfile(profile);
      const result = await uploadPhoto(file);
      setSaved(result);
      setProfile({ ...result });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function onExtractResume(file: File) {
    setError(null);
    setResumeStatus("extracting");
    try {
      const draft = await extractResumeDraft(file, resumeProvider || undefined);
      setProfile((current) => ({ ...current, ...draft }));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setResumeStatus("idle");
      if (resumeInputRef.current) {
        resumeInputRef.current.value = "";
      }
    }
  }

  async function onDownloadResume() {
    setError(null);
    try {
      await downloadResumePdf();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function onRemovePhoto(id: string) {
    setError(null);
    try {
      const result = await deletePhoto(id);
      setSaved(result);
      setProfile({ ...result });
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Content <span>Studio</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div className="eyebrow">LinkedIn for technology professionals</div>
          <button
            className="docs-link"
            type="button"
            onClick={() => setShowDocs(true)}
          >
            Docs
          </button>
        </div>
      </header>

      {showDocs ? (
        <section className="panel">
          <DocsView onClose={() => setShowDocs(false)} />
        </section>
      ) : step === "welcome" ? (
        <Welcome onStart={() => setStep("identity")} />
      ) : (
        <section className="panel">
          <p className="eyebrow">
            {step === "persona"
              ? "Content authority"
              : step === "plan"
                ? "12-week content plan"
                : step === "custom"
                  ? "Your own ideas"
                  : step === "discover"
                    ? "Current events"
                    : step === "post"
                      ? "Publishable draft"
                      : step === "history"
                        ? "Post history"
                        : "Professional profile"}
          </p>
          <h2>
            {step === "persona"
              ? "How the system reads your profile"
              : step === "plan"
                ? "Choose from the approved calendar"
                : step === "custom"
                  ? "Write from a topic only you thought of"
                  : step === "discover"
                    ? "React to what's happening now"
                    : step === "post"
                      ? "Write from the selected angle"
                      : step === "history"
                        ? "Everything you've written so far"
                        : "Tell the system who you actually are"}
          </h2>
          <nav className="steps" aria-label="Profile sections">
            {STEPS.filter((item) => item.id !== "welcome").map((item) => (
              <button
                key={item.id}
                className={item.id === step ? "step active" : "step"}
                onClick={() => {
                  if (item.id === "history") {
                    setCompareOpportunityId(null);
                  }
                  setStep(item.id);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {error ? <div className="error">{error}</div> : null}
          {saved?.evidenceWarning &&
          step !== "persona" &&
          step !== "plan" &&
          step !== "custom" &&
          step !== "discover" &&
          step !== "post" &&
          step !== "history" ? (
            <div className="notice">{saved.evidenceWarning}</div>
          ) : null}

          {step === "identity" ? (
            <>
              <div className="notice">
                <p>
                  Upload a resume PDF to pre-fill these forms with what it actually says. Nothing
                  is saved until you review the fields below and click Save and continue.
                </p>
                <div className="actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept="application/pdf"
                    disabled={resumeStatus === "extracting"}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onExtractResume(file);
                    }}
                  />
                  <ProviderSelect
                    label="Text provider"
                    value={resumeProvider}
                    onChange={setResumeProvider}
                    options={TEXT_PROVIDERS}
                    labels={TEXT_PROVIDER_LABELS}
                  />
                </div>
                {resumeStatus === "extracting" ? (
                  <p className="status">Reading the resume…</p>
                ) : null}
              </div>
              <IdentityForm profile={profile} onChange={setProfile} />
            </>
          ) : null}
          {step === "experience" ? (
            <>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn ghost" type="button" onClick={() => void onDownloadResume()}>
                  Download updated résumé
                </button>
              </div>
              <ExperienceForm profile={profile} onChange={setProfile} />
            </>
          ) : null}
          {step === "positioning" ? (
            <PositioningForm profile={profile} onChange={setProfile} />
          ) : null}
          {step === "writing" ? (
            <WritingForm profile={profile} onChange={setProfile} />
          ) : null}
          {step === "photos" ? (
            <PhotoForm
              photos={saved?.photos ?? []}
              onUpload={onUpload}
              onRemove={onRemovePhoto}
              uploading={status === "uploading"}
            />
          ) : null}
          {step === "persona" ? <PersonaView /> : null}
          {step === "plan" ? (
            <ContentPlanView
              onSelected={() => {
                setEditingPostId(null);
                setStep("post");
              }}
            />
          ) : null}
          {step === "custom" ? (
            <CustomTopicsView
              onSelected={() => {
                setEditingPostId(null);
                setStep("post");
              }}
            />
          ) : null}
          {step === "discover" ? (
            <DiscoverView
              onContinue={() => {
                setEditingPostId(null);
                setStep("post");
              }}
            />
          ) : null}
          {step === "post" ? (
            <PostView
              editingPostId={editingPostId}
              onExitEditing={() => setEditingPostId(null)}
              onCompareVersions={(opportunityId) => {
                setCompareOpportunityId(opportunityId);
                setStep("history");
              }}
            />
          ) : null}
          {step === "history" ? (
            <PostHistoryView
              opportunityId={compareOpportunityId ?? undefined}
              onClearFilter={() => setCompareOpportunityId(null)}
              onEdit={(id) => {
                setEditingPostId(id);
                setStep("post");
              }}
            />
          ) : null}

          {step !== "persona" &&
          step !== "plan" &&
          step !== "custom" &&
          step !== "discover" &&
          step !== "post" &&
          step !== "history" ? (
          <div className="actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => setStep(STEPS[Math.max(1, stepIndex - 1)]?.id ?? "identity")}
            >
              Back
            </button>
            <div>
              <p className="status">
                {status === "saving"
                  ? "Saving…"
                  : status === "loading"
                    ? "Loading profile…"
                    : saved
                      ? "Saved locally in this workspace"
                      : "Not saved yet"}
              </p>
            </div>
            {step === "photos" ? (
              <button className="btn primary" type="button" onClick={() => persist("persona")}>
                Save and continue
              </button>
            ) : (
              <button
                className="btn primary"
                type="button"
                disabled={status === "saving"}
                onClick={() => persist(STEPS[stepIndex + 1]?.id)}
              >
                Save and continue
              </button>
            )}
          </div>
          ) : (
            <div className="actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() =>
                  setStep(
                    step === "history"
                      ? "post"
                      : step === "post"
                        ? "discover"
                        : step === "discover"
                          ? "persona"
                          : step === "custom"
                            ? "persona"
                            : step === "plan"
                              ? "persona"
                              : "photos",
                  )
                }
              >
                Back
              </button>
              {step === "persona" ? (
                <button className="btn primary" type="button" onClick={() => setStep("plan")}>
                  Continue to content plan
                </button>
              ) : null}
              {step === "persona" ? (
                <button className="btn ghost" type="button" onClick={() => setStep("custom")}>
                  Continue to my topics
                </button>
              ) : null}
              {step === "persona" ? (
                <button className="btn ghost" type="button" onClick={() => setStep("discover")}>
                  Continue to discover news
                </button>
              ) : null}
              {step === "post" ? (
                <button className="btn ghost" type="button" onClick={() => setStep("history")}>
                  Continue to history
                </button>
              ) : null}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Not a generic post generator</p>
        <h1>Write from authority you actually have.</h1>
        <p className="lede">
          LinkedIn Content Studio starts with your real background, then looks for current
          technology events you have a credible reason to discuss. It will not invent your
          experience, scrape LinkedIn, or chase empty engagement.
        </p>
        <div className="actions" style={{ justifyContent: "flex-start", marginTop: 24 }}>
          <button className="btn primary" type="button" onClick={onStart}>
            Build your professional profile
          </button>
        </div>
      </div>
      <aside className="panel">
        <p className="eyebrow">The journey</p>
        <h3>Profile first. Content later.</h3>
        <ul className="promise-list">
          <li>Capture identity, proof, positioning, and writing style.</li>
          <li>Upload up to three reference photos for later image generation.</li>
          <li>Incomplete fields are allowed. Thin evidence will be called out.</li>
          <li>Generate a persona that maps what you can credibly talk about.</li>
          <li>Discover current events matched to that authority, not to whatever is trending.</li>
          <li>Compare a few angles and choose one the profile can actually support.</li>
          <li>Write a post from that angle, then review claims before you copy it.</li>
        </ul>
      </aside>
    </section>
  );
}

function IdentityForm({
  profile,
  onChange,
}: {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
}) {
  return (
    <div className="grid-2">
      <Field label="Full name">
        <input
          value={profile.fullName}
          onChange={(event) => onChange({ ...profile, fullName: event.target.value })}
        />
      </Field>
      <Field label="Headline">
        <input
          value={profile.headline}
          onChange={(event) => onChange({ ...profile, headline: event.target.value })}
        />
      </Field>
      <Field label="Current title">
        <input
          value={profile.currentJobTitle}
          onChange={(event) => onChange({ ...profile, currentJobTitle: event.target.value })}
        />
      </Field>
      <Field label="Current company">
        <input
          value={profile.currentCompany}
          onChange={(event) => onChange({ ...profile, currentCompany: event.target.value })}
        />
      </Field>
      <Field label="Years of experience">
        <input
          type="number"
          min={0}
          max={60}
          value={profile.yearsOfExperience ?? ""}
          onChange={(event) =>
            onChange({
              ...profile,
              yearsOfExperience: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      </Field>
      <Field label="Preferred language">
        <input
          value={profile.preferredLanguage}
          onChange={(event) => onChange({ ...profile, preferredLanguage: event.target.value })}
        />
      </Field>
      <Field className="full" label="About">
        <textarea
          value={profile.about}
          onChange={(event) => onChange({ ...profile, about: event.target.value })}
        />
      </Field>
      <Field className="full" label="Top skills">
        <TagInput
          values={profile.topSkills}
          onChange={(topSkills) => onChange({ ...profile, topSkills })}
        />
      </Field>
      <Field className="full" label="Technologies">
        <TagInput
          values={profile.technologies}
          onChange={(technologies) => onChange({ ...profile, technologies })}
        />
      </Field>
      <Field className="full" label="Industries">
        <TagInput
          values={profile.industries}
          onChange={(industries) => onChange({ ...profile, industries })}
        />
      </Field>
    </div>
  );
}

function ExperienceForm({
  profile,
  onChange,
}: {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
}) {
  return (
    <div>
      {profile.experiences.length === 0 ? (
        <p className="empty">Add roles that can later justify a professional point of view.</p>
      ) : null}
      {profile.experiences.map((experience, index) => (
        <article className="experience-card" key={experience.id ?? index}>
          <div className="grid-2">
            <Field label="Role">
              <input
                value={experience.role}
                onChange={(event) =>
                  updateExperience(profile, onChange, index, { role: event.target.value })
                }
              />
            </Field>
            <Field label="Company">
              <input
                value={experience.company}
                onChange={(event) =>
                  updateExperience(profile, onChange, index, { company: event.target.value })
                }
              />
            </Field>
            <Field label="Start">
              <input
                value={experience.startPeriod}
                onChange={(event) =>
                  updateExperience(profile, onChange, index, { startPeriod: event.target.value })
                }
              />
            </Field>
            <Field label="End">
              <input
                value={experience.endPeriod}
                onChange={(event) =>
                  updateExperience(profile, onChange, index, { endPeriod: event.target.value })
                }
              />
            </Field>
            <Field className="full" label="What you did">
              <textarea
                value={experience.description}
                onChange={(event) =>
                  updateExperience(profile, onChange, index, { description: event.target.value })
                }
              />
            </Field>
            <Field className="full" label="Achievements">
              <textarea
                value={experience.achievements}
                onChange={(event) =>
                  updateExperience(profile, onChange, index, { achievements: event.target.value })
                }
              />
            </Field>
            <Field className="full" label="Technologies in this role">
              <TagInput
                values={experience.technologies}
                onChange={(technologies) =>
                  updateExperience(profile, onChange, index, { technologies })
                }
              />
            </Field>
          </div>
          <button
            className="btn ghost"
            type="button"
            onClick={() =>
              onChange({
                ...profile,
                experiences: profile.experiences.filter((_, itemIndex) => itemIndex !== index),
              })
            }
          >
            Remove role
          </button>
        </article>
      ))}
      <Field label="Architecture experience">
        <textarea
          value={profile.architectureExperience}
          onChange={(event) => onChange({ ...profile, architectureExperience: event.target.value })}
        />
      </Field>
      <Field label="Leadership experience">
        <textarea
          value={profile.leadershipExperience}
          onChange={(event) => onChange({ ...profile, leadershipExperience: event.target.value })}
        />
      </Field>
      <Field label="Business impact">
        <textarea
          value={profile.businessImpact}
          onChange={(event) => onChange({ ...profile, businessImpact: event.target.value })}
        />
      </Field>
      <button
        className="btn ghost"
        type="button"
        onClick={() =>
          onChange({
            ...profile,
            experiences: [
              ...profile.experiences,
              {
                role: "",
                company: "",
                startPeriod: "",
                endPeriod: "",
                description: "",
                responsibilities: "",
                achievements: "",
                technologies: [],
                measurableOutcomes: "",
              },
            ],
          })
        }
      >
        Add experience
      </button>
    </div>
  );
}

function PositioningForm({
  profile,
  onChange,
}: {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
}) {
  return (
    <div>
      <Field label="How should people describe you after reading your posts?">
        <textarea
          value={profile.desiredPerception}
          onChange={(event) => onChange({ ...profile, desiredPerception: event.target.value })}
        />
      </Field>
      <Field label="Positioning">
        <div className="pills">
          {POSITIONING_OPTIONS.map((option) => {
            const selected = profile.positioning.includes(option);
            return (
              <button
                key={option}
                type="button"
                className={selected ? "pill selected" : "pill"}
                onClick={() =>
                  onChange({
                    ...profile,
                    positioning: selected
                      ? profile.positioning.filter((item) => item !== option)
                      : [...profile.positioning, option],
                  })
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Target audience">
        <textarea
          value={profile.targetAudience}
          onChange={(event) => onChange({ ...profile, targetAudience: event.target.value })}
        />
      </Field>
      <Field label="Subjects of interest">
        <TagInput
          values={profile.subjectsOfInterest}
          onChange={(subjectsOfInterest) => onChange({ ...profile, subjectsOfInterest })}
        />
      </Field>
      <Field label="Subjects to avoid">
        <TagInput
          values={profile.subjectsToAvoid}
          onChange={(subjectsToAvoid) => onChange({ ...profile, subjectsToAvoid })}
        />
      </Field>
    </div>
  );
}

function WritingForm({
  profile,
  onChange,
}: {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
}) {
  return (
    <div>
      <Field label="Tone">
        <div className="pills">
          {WRITING_TONES.map((tone) => {
            const selected = profile.writingTones.includes(tone);
            return (
              <button
                key={tone}
                type="button"
                className={selected ? "pill selected" : "pill"}
                onClick={() =>
                  onChange({
                    ...profile,
                    writingTones: selected
                      ? profile.writingTones.filter((item) => item !== tone)
                      : [...profile.writingTones, tone].slice(0, 4),
                  })
                }
              >
                {tone}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Preferred post length">
        <div className="pills">
          {POST_LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              className={profile.postLength === length ? "pill selected" : "pill"}
              onClick={() => onChange({ ...profile, postLength: length })}
            >
              {length}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Optional writing sample">
        <textarea
          value={profile.writingSamples[0]?.body ?? ""}
          onChange={(event) =>
            onChange({
              ...profile,
              writingSamples: event.target.value ? [{ body: event.target.value }] : [],
            })
          }
        />
      </Field>
    </div>
  );
}

function PhotoForm({
  photos,
  onUpload,
  onRemove,
  uploading,
}: {
  photos: NonNullable<ProfilePublic["photos"]>;
  onUpload: (file: File) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  uploading: boolean;
}) {
  return (
    <div>
      <p className="lede">
        Up to three professional photos. They are identity references for later image generation,
        not a gallery.
      </p>
      <div className="photos">
        {photos.map((photo) => (
          <div className="photo-card" key={photo.id}>
            <img src={photo.url} alt="Reference" />
            <button className="btn ghost" type="button" onClick={() => onRemove(photo.id)}>
              Remove
            </button>
          </div>
        ))}
        {photos.length < 3 ? (
          <label className="photo-card" style={{ display: "grid", placeItems: "center" }}>
            {uploading ? "Uploading…" : "Add photo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      {label}
      {children}
    </label>
  );
}

function updateExperience(
  profile: ProfileInput,
  onChange: (profile: ProfileInput) => void,
  index: number,
  patch: Partial<ProfileInput["experiences"][number]>,
) {
  onChange({
    ...profile,
    experiences: profile.experiences.map((experience, itemIndex) =>
      itemIndex === index ? { ...experience, ...patch } : experience,
    ),
  });
}
