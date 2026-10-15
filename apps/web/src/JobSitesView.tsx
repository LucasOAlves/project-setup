import { useEffect, useState } from "react";
import {
  JOB_SITE_KINDS,
  JOB_SITES,
  TALENT_PROFILE_STATUSES,
  type JobSite,
  type JobSiteKind,
  type TalentProfilePublic,
  type TalentProfileStatus,
} from "@studio/shared";
import { fetchTalentProfiles, saveTalentProfile, type ApiError } from "./api";

const KIND_HEADINGS: Record<JobSiteKind, { title: string; description: string }> = {
  AUTOMATIC: {
    title: "Read automatically",
    description: "Daily discovery reads these through their public feed or API. Their jobs land in the Job feed.",
  },
  TALENT_PLATFORM: {
    title: "Talent platforms",
    description: "Build a profile once and they match you to roles. Track where you stand on each one.",
  },
  LINK_OUT: {
    title: "Browse on the site",
    description: "No feed, a login, or terms that do not allow reuse. Open them and search there.",
  },
  FREELANCE: {
    title: "Freelance marketplaces",
    description: "Project work, outside the full-time target. Listed for reference only.",
  },
  NOT_A_JOB_SOURCE: {
    title: "Not a job source",
    description: "On the list, but not a place to find roles.",
  },
};

const STATUS_LABELS: Record<TalentProfileStatus, string> = {
  NOT_STARTED: "Not started",
  APPLIED: "Applied",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  NOT_INTERESTED: "Not interested",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function JobSitesView() {
  const [profiles, setProfiles] = useState<Record<string, TalentProfilePublic>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTalentProfiles()
      .then((list) => setProfiles(Object.fromEntries(list.map((profile) => [profile.siteId, profile]))))
      .catch((caught: ApiError) => setError(caught.message));
  }, []);

  async function save(siteId: string, status: TalentProfileStatus, note: string) {
    setError(null);
    try {
      const profile = await saveTalentProfile(siteId, { status, note });
      setProfiles((current) => ({ ...current, [siteId]: profile }));
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  return (
    <div>
      <p className="lede">
        Every site on your list, grouped by how it takes part in the search. Only sites whose terms
        allow automated reading are read for you; the rest open in a new tab.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {JOB_SITE_KINDS.map((kind) => {
        const sites = JOB_SITES.filter((site) => site.kind === kind);
        if (sites.length === 0) return null;
        return (
          <section className="article-card" key={kind} data-testid={`sites-${kind}`}>
            <h3>
              {KIND_HEADINGS[kind].title} <span className="tag">{sites.length}</span>
            </h3>
            <p className="lede">{KIND_HEADINGS[kind].description}</p>
            {sites.map((site) =>
              kind === "TALENT_PLATFORM" ? (
                <TalentSiteRow key={site.id} site={site} profile={profiles[site.id]} onSave={save} />
              ) : (
                <SiteRow key={site.id} site={site} />
              ),
            )}
          </section>
        );
      })}
    </div>
  );
}

function SiteLink({ site }: { site: JobSite }) {
  return (
    <a href={site.url} target="_blank" rel="noreferrer">
      {site.name}
    </a>
  );
}

function SiteRow({ site }: { site: JobSite }) {
  return (
    <p>
      <strong>
        <SiteLink site={site} />
      </strong>
      {site.note ? ` · ${site.note}` : null}
    </p>
  );
}

function TalentSiteRow({
  site,
  profile,
  onSave,
}: {
  site: JobSite;
  profile: TalentProfilePublic | undefined;
  onSave: (siteId: string, status: TalentProfileStatus, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(profile?.note ?? "");
  const status = profile?.status ?? "NOT_STARTED";

  useEffect(() => setNote(profile?.note ?? ""), [profile?.note]);

  return (
    <div data-testid={`talent-${site.id}`} style={{ marginBottom: 12 }}>
      <p style={{ marginBottom: 4 }}>
        <strong>
          <SiteLink site={site} />
        </strong>
        {site.note ? ` · ${site.note}` : null}
      </p>
      <div className="grid-2">
        <label className="field">
          Status
          <select
            value={status}
            onChange={(event) => void onSave(site.id, event.target.value as TalentProfileStatus, note)}
          >
            {TALENT_PROFILE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Note
          <input
            value={note}
            maxLength={1000}
            placeholder="e.g. passed the coding test"
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              if (note !== (profile?.note ?? "")) void onSave(site.id, status, note);
            }}
          />
        </label>
      </div>
      {profile ? <p className="eyebrow">Last updated {formatDate(profile.updatedAt)}</p> : null}
    </div>
  );
}
