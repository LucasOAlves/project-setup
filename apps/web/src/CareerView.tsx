import { useEffect, useState } from "react";
import {
  JOB_EMPLOYMENT_TYPES,
  JOB_STATUSES,
  JOB_WORKPLACE_TYPES,
  RECRUITER_CONNECTION_STATUSES,
  TEXT_PROVIDERS,
  TEXT_PROVIDER_LABELS,
  type CompanyPublic,
  type JobEmploymentType,
  type JobFitResult,
  type JobPublic,
  type CareerAnalytics,
  type ContentTopicSuggestion,
  type JobStatus,
  type JobWorkplaceType,
  type OutreachMessage,
  type RecruiterConnectionStatus,
  type RecruiterPublic,
  type ResumeTailoringPlan,
  type TextProviderName,
} from "@studio/shared";
import {
  computeJobFit,
  createCompany,
  createJob,
  createRecruiter,
  deleteJob,
  deleteRecruiter,
  downloadTailoredResume,
  fetchCareerAnalytics,
  fetchCompanies,
  fetchContentSuggestions,
  fetchJobs,
  fetchRecruiters,
  generateOutreachMessage,
  generateResumeTailoringPlan,
  importFromGreenhouse,
  patchJob,
  patchRecruiter,
  scoreRecruiter,
  updateJobStatus,
  updateRecruiterConnectionStatus,
  type ApiError,
} from "./api";
import { ProviderSelect } from "./ProviderSelect";
import { TagInput } from "./TagInput";

const CONNECTION_STATUS_LABELS: Record<RecruiterConnectionStatus, string> = {
  NOT_CONNECTED: "Not connected",
  REQUESTED: "Requested",
  CONNECTED: "Connected",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  SAVED: "Saved",
  SHORTLISTED: "Shortlisted",
  PREPARING: "Preparing",
  APPLIED: "Applied",
  RECRUITER_CONTACTED: "Recruiter contacted",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  TECHNICAL_INTERVIEW: "Technical interview",
  FINAL_INTERVIEW: "Final interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const emptyCompanyForm = () => ({ name: "", website: "", linkedinUrl: "" });

const emptyJobForm = () => ({
  companyId: "",
  title: "",
  url: "",
  location: "",
  workplaceType: "" as JobWorkplaceType | "",
  employmentType: "" as JobEmploymentType | "",
  seniority: "",
  technologies: [] as string[],
});

const emptyRecruiterForm = () => ({
  companyId: "",
  relatedJobId: "",
  name: "",
  role: "",
  linkedinUrl: "",
});

export function CareerView({
  onDraftTopic,
}: {
  onDraftTopic: (draft: { hook: string; pillar: string; keyPoint: string }) => void;
}) {
  const [companies, setCompanies] = useState<CompanyPublic[]>([]);
  const [jobs, setJobs] = useState<JobPublic[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [jobForm, setJobForm] = useState(emptyJobForm());
  const [fitResults, setFitResults] = useState<Record<string, JobFitResult>>({});
  const [scoringJobId, setScoringJobId] = useState<string | null>(null);
  const [tailoringPlans, setTailoringPlans] = useState<Record<string, ResumeTailoringPlan>>({});
  const [tailoringJobId, setTailoringJobId] = useState<string | null>(null);
  const [tailoringProvider, setTailoringProvider] = useState<TextProviderName | "">("");
  const [recruiters, setRecruiters] = useState<RecruiterPublic[]>([]);
  const [recruiterForm, setRecruiterForm] = useState(emptyRecruiterForm());
  const [scoringRecruiterId, setScoringRecruiterId] = useState<string | null>(null);
  const [outreachRecruiterId, setOutreachRecruiterId] = useState<string | null>(null);
  const [outreachMessages, setOutreachMessages] = useState<Record<string, OutreachMessage>>({});
  const [outreachProvider, setOutreachProvider] = useState<TextProviderName | "">("");
  const [analytics, setAnalytics] = useState<CareerAnalytics | null>(null);
  const [importingCompanyId, setImportingCompanyId] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<Record<string, { imported: number; skipped: number }>>({});
  const [contentSuggestions, setContentSuggestions] = useState<ContentTopicSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCompanies(),
      fetchJobs(),
      fetchRecruiters(),
      fetchCareerAnalytics(),
      fetchContentSuggestions(),
    ])
      .then(([existingCompanies, existingJobs, existingRecruiters, existingAnalytics, existingSuggestions]) => {
        if (cancelled) return;
        setCompanies(existingCompanies);
        setJobs(existingJobs);
        setRecruiters(existingRecruiters);
        setAnalytics(existingAnalytics);
        setContentSuggestions(existingSuggestions);
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

  async function refreshAnalytics() {
    try {
      const [nextAnalytics, nextSuggestions] = await Promise.all([
        fetchCareerAnalytics(),
        fetchContentSuggestions(),
      ]);
      setAnalytics(nextAnalytics);
      setContentSuggestions(nextSuggestions);
    } catch {
      // Analytics are a summary, not the primary action the user is taking — fail quietly and
      // let the next natural refresh (or a manual reload) pick it up rather than surfacing a
      // second error banner on top of whatever the user was actually doing.
    }
  }

  async function addCompany() {
    setError(null);
    if (!companyForm.name.trim()) {
      setError("Give the company a name.");
      return;
    }
    setStatus("saving");
    try {
      const company = await createCompany({
        name: companyForm.name.trim(),
        website: companyForm.website.trim(),
        linkedinUrl: companyForm.linkedinUrl.trim(),
        industry: "",
        size: "",
        locations: [],
        careerPageUrl: "",
        notes: "",
      });
      setCompanies((current) => [company, ...current]);
      setCompanyForm(emptyCompanyForm());
      setJobForm((current) => ({ ...current, companyId: current.companyId || company.id }));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function importGreenhouse(companyId: string, boardToken: string) {
    setError(null);
    setImportingCompanyId(companyId);
    try {
      const result = await importFromGreenhouse(companyId, boardToken);
      setJobs((current) => [...result.imported, ...current]);
      setImportResults((current) => ({
        ...current,
        [companyId]: { imported: result.imported.length, skipped: result.skipped },
      }));
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setImportingCompanyId(null);
    }
  }

  async function addJob() {
    setError(null);
    if (!jobForm.companyId || !jobForm.title.trim()) {
      setError("Pick a company and give the job a title.");
      return;
    }
    setStatus("saving");
    try {
      const job = await createJob({
        companyId: jobForm.companyId,
        title: jobForm.title.trim(),
        url: jobForm.url.trim(),
        location: jobForm.location.trim(),
        workplaceType: jobForm.workplaceType || null,
        employmentType: jobForm.employmentType || null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: "",
        description: "",
        requirements: [],
        preferredQualifications: [],
        technologies: jobForm.technologies,
        seniority: jobForm.seniority.trim(),
        notes: "",
        nextAction: "",
      });
      setJobs((current) => [job, ...current]);
      setJobForm({ ...emptyJobForm(), companyId: jobForm.companyId });
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function markStatus(id: string, next: JobStatus) {
    setError(null);
    try {
      const job = await updateJobStatus(id, next);
      setJobs((current) => current.map((item) => (item.id === id ? job : item)));
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function saveNotes(id: string, notes: string, nextAction: string) {
    setError(null);
    try {
      const job = await patchJob(id, { notes, nextAction });
      setJobs((current) => current.map((item) => (item.id === id ? job : item)));
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function scoreFit(id: string) {
    setError(null);
    setScoringJobId(id);
    try {
      const fit = await computeJobFit(id);
      setFitResults((current) => ({ ...current, [id]: fit }));
      setJobs((current) =>
        current.map((item) => (item.id === id ? { ...item, fitScore: fit.overall } : item)),
      );
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setScoringJobId(null);
    }
  }

  async function tailorResume(id: string) {
    setError(null);
    setTailoringJobId(id);
    try {
      const plan = await generateResumeTailoringPlan(id, tailoringProvider || undefined);
      setTailoringPlans((current) => ({ ...current, [id]: plan }));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setTailoringJobId(null);
    }
  }

  async function downloadTailored(id: string) {
    setError(null);
    const plan = tailoringPlans[id];
    if (!plan) return;
    try {
      await downloadTailoredResume(id, plan);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function removeJob(id: string) {
    setError(null);
    try {
      setJobs(await deleteJob(id));
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function addRecruiter() {
    setError(null);
    if (!recruiterForm.companyId || !recruiterForm.name.trim()) {
      setError("Pick a company and give the contact a name.");
      return;
    }
    setStatus("saving");
    try {
      const recruiter = await createRecruiter({
        companyId: recruiterForm.companyId,
        relatedJobId: recruiterForm.relatedJobId || null,
        name: recruiterForm.name.trim(),
        role: recruiterForm.role.trim(),
        linkedinUrl: recruiterForm.linkedinUrl.trim(),
        notes: "",
        nextAction: "",
      });
      setRecruiters((current) => [recruiter, ...current]);
      setRecruiterForm({ ...emptyRecruiterForm(), companyId: recruiterForm.companyId });
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setStatus("idle");
    }
  }

  async function changeConnectionStatus(id: string, next: RecruiterConnectionStatus) {
    setError(null);
    try {
      const recruiter = await updateRecruiterConnectionStatus(id, next);
      setRecruiters((current) => current.map((item) => (item.id === id ? recruiter : item)));
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function saveRecruiterNotes(id: string, notes: string, nextAction: string) {
    setError(null);
    try {
      const recruiter = await patchRecruiter(id, { notes, nextAction });
      setRecruiters((current) => current.map((item) => (item.id === id ? recruiter : item)));
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function scoreRecruiterRelevance(id: string) {
    setError(null);
    setScoringRecruiterId(id);
    try {
      const recruiter = await scoreRecruiter(id);
      setRecruiters((current) => current.map((item) => (item.id === id ? recruiter : item)));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setScoringRecruiterId(null);
    }
  }

  async function prepareOutreach(id: string) {
    setError(null);
    setOutreachRecruiterId(id);
    try {
      const message = await generateOutreachMessage(id, outreachProvider || undefined);
      setOutreachMessages((current) => ({ ...current, [id]: message }));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setOutreachRecruiterId(null);
    }
  }

  async function removeRecruiter(id: string) {
    setError(null);
    try {
      setRecruiters(await deleteRecruiter(id));
      void refreshAnalytics();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  function companyName(companyId: string): string {
    return companies.find((company) => company.id === companyId)?.name ?? "Unknown company";
  }

  if (status === "loading") {
    return <p className="empty">Loading your career tracker…</p>;
  }

  return (
    <div>
      <p className="lede">
        Track companies and roles you are actually pursuing. Nothing here talks to LinkedIn or
        any job board yet — everything is typed in by hand, the same way the rest of this
        workspace works.
      </p>
      {error ? <div className="error">{error}</div> : null}

      {analytics ? <AnalyticsPanel analytics={analytics} /> : null}

      {contentSuggestions.length > 0 ? (
        <section>
          <h3>Content ideas from your job search</h3>
          <p className="lede">
            Technologies your tracked jobs actually ask for, matched against real evidence
            already in your profile — never a technology you have no proof for.
          </p>
          <div className="article-list">
            {contentSuggestions.map((suggestion) => (
              <article className="article-card" key={suggestion.technology}>
                <p className="eyebrow">
                  {suggestion.jobCount} of {suggestion.totalJobs} jobs · {suggestion.demandPercent}
                  % demand
                </p>
                <h3>{suggestion.technology}</h3>
                <p>{suggestion.evidence}</p>
                <div className="actions">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      onDraftTopic({
                        hook: suggestion.hook,
                        pillar: suggestion.technology,
                        keyPoint: suggestion.evidence,
                      })
                    }
                  >
                    Draft this as a topic
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <h3>Companies</h3>
      <div className="grid-2">
        <label className="field">
          Name
          <input
            value={companyForm.name}
            onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })}
          />
        </label>
        <label className="field">
          Website (optional)
          <input
            value={companyForm.website}
            onChange={(event) => setCompanyForm({ ...companyForm, website: event.target.value })}
            placeholder="https://…"
          />
        </label>
        <label className="field">
          LinkedIn URL (optional)
          <input
            value={companyForm.linkedinUrl}
            onChange={(event) =>
              setCompanyForm({ ...companyForm, linkedinUrl: event.target.value })
            }
            placeholder="https://linkedin.com/company/…"
          />
        </label>
      </div>
      <div className="actions">
        <button
          className="btn ghost"
          type="button"
          disabled={status === "saving"}
          onClick={() => void addCompany()}
        >
          Add company
        </button>
      </div>

      {companies.length === 0 ? (
        <p className="empty">No companies yet. Add one above before adding a job.</p>
      ) : (
        <div className="article-list">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              importing={importingCompanyId === company.id}
              importResult={importResults[company.id] ?? null}
              onImport={(boardToken) => void importGreenhouse(company.id, boardToken)}
            />
          ))}
        </div>
      )}

      <h3>Jobs</h3>
      <div className="grid-2">
        <ProviderSelect
          label="Résumé tailoring text provider"
          value={tailoringProvider}
          onChange={setTailoringProvider}
          options={TEXT_PROVIDERS}
          labels={TEXT_PROVIDER_LABELS}
        />
      </div>
      {companies.length > 0 ? (
        <>
          <div className="grid-2">
            <label className="field">
              Company
              <select
                value={jobForm.companyId}
                onChange={(event) => setJobForm({ ...jobForm, companyId: event.target.value })}
              >
                <option value="">Select a company…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Title
              <input
                value={jobForm.title}
                onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })}
              />
            </label>
            <label className="field">
              Job URL (optional)
              <input
                value={jobForm.url}
                onChange={(event) => setJobForm({ ...jobForm, url: event.target.value })}
                placeholder="https://…"
              />
            </label>
            <label className="field">
              Location (optional)
              <input
                value={jobForm.location}
                onChange={(event) => setJobForm({ ...jobForm, location: event.target.value })}
              />
            </label>
            <label className="field">
              Workplace
              <select
                value={jobForm.workplaceType}
                onChange={(event) =>
                  setJobForm({
                    ...jobForm,
                    workplaceType: event.target.value as JobWorkplaceType | "",
                  })
                }
              >
                <option value="">Unspecified</option>
                {JOB_WORKPLACE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Employment type
              <select
                value={jobForm.employmentType}
                onChange={(event) =>
                  setJobForm({
                    ...jobForm,
                    employmentType: event.target.value as JobEmploymentType | "",
                  })
                }
              >
                <option value="">Unspecified</option>
                {JOB_EMPLOYMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Seniority (optional)
              <input
                value={jobForm.seniority}
                onChange={(event) => setJobForm({ ...jobForm, seniority: event.target.value })}
              />
            </label>
            <label className="field full">
              Technologies
              <TagInput
                values={jobForm.technologies}
                onChange={(technologies) => setJobForm({ ...jobForm, technologies })}
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="btn primary"
              type="button"
              disabled={status === "saving"}
              onClick={() => void addJob()}
            >
              Add job
            </button>
          </div>
        </>
      ) : null}

      {jobs.length === 0 ? (
        <p className="empty">No jobs tracked yet.</p>
      ) : (
        <div className="article-list">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              companyName={companyName(job.companyId)}
              fit={fitResults[job.id] ?? null}
              scoring={scoringJobId === job.id}
              tailoringPlan={tailoringPlans[job.id] ?? null}
              tailoring={tailoringJobId === job.id}
              onStatusChange={(next) => void markStatus(job.id, next)}
              onSaveNotes={(notes, nextAction) => void saveNotes(job.id, notes, nextAction)}
              onDelete={() => void removeJob(job.id)}
              onScoreFit={() => void scoreFit(job.id)}
              onTailorResume={() => void tailorResume(job.id)}
              onDownloadTailored={() => void downloadTailored(job.id)}
            />
          ))}
        </div>
      )}

      <h3>Recruiters &amp; contacts</h3>
      <div className="grid-2">
        <ProviderSelect
          label="Outreach text provider"
          value={outreachProvider}
          onChange={setOutreachProvider}
          options={TEXT_PROVIDERS}
          labels={TEXT_PROVIDER_LABELS}
        />
      </div>
      {companies.length > 0 ? (
        <>
          <div className="grid-2">
            <label className="field">
              Company
              <select
                value={recruiterForm.companyId}
                onChange={(event) =>
                  setRecruiterForm({ ...recruiterForm, companyId: event.target.value })
                }
              >
                <option value="">Select a company…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Related job (optional)
              <select
                value={recruiterForm.relatedJobId}
                onChange={(event) =>
                  setRecruiterForm({ ...recruiterForm, relatedJobId: event.target.value })
                }
              >
                <option value="">None</option>
                {jobs
                  .filter((job) => job.companyId === recruiterForm.companyId)
                  .map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Name
              <input
                value={recruiterForm.name}
                onChange={(event) =>
                  setRecruiterForm({ ...recruiterForm, name: event.target.value })
                }
              />
            </label>
            <label className="field">
              Role (optional)
              <input
                value={recruiterForm.role}
                onChange={(event) =>
                  setRecruiterForm({ ...recruiterForm, role: event.target.value })
                }
                placeholder="Technical Recruiter, Engineering Manager…"
              />
            </label>
            <label className="field">
              LinkedIn URL (optional)
              <input
                value={recruiterForm.linkedinUrl}
                onChange={(event) =>
                  setRecruiterForm({ ...recruiterForm, linkedinUrl: event.target.value })
                }
                placeholder="https://linkedin.com/in/…"
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="btn primary"
              type="button"
              disabled={status === "saving"}
              onClick={() => void addRecruiter()}
            >
              Add contact
            </button>
          </div>
        </>
      ) : null}

      {recruiters.length === 0 ? (
        <p className="empty">No recruiters or contacts tracked yet.</p>
      ) : (
        <div className="article-list">
          {recruiters.map((recruiter) => (
            <RecruiterCard
              key={recruiter.id}
              recruiter={recruiter}
              companyName={companyName(recruiter.companyId)}
              relatedJobTitle={jobs.find((job) => job.id === recruiter.relatedJobId)?.title ?? null}
              scoring={scoringRecruiterId === recruiter.id}
              outreaching={outreachRecruiterId === recruiter.id}
              outreachMessage={outreachMessages[recruiter.id] ?? null}
              onConnectionChange={(next) => void changeConnectionStatus(recruiter.id, next)}
              onSaveNotes={(notes, nextAction) =>
                void saveRecruiterNotes(recruiter.id, notes, nextAction)
              }
              onScore={() => void scoreRecruiterRelevance(recruiter.id)}
              onPrepareOutreach={() => void prepareOutreach(recruiter.id)}
              onDelete={() => void removeRecruiter(recruiter.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const RECOMMENDATION_LABELS: Record<JobFitResult["recommendation"], string> = {
  STRONG_APPLY: "Strong apply",
  APPLY: "Apply",
  STRETCH: "Stretch",
  WEAK_FIT: "Weak fit",
};

function JobCard({
  job,
  companyName,
  fit,
  scoring,
  tailoringPlan,
  tailoring,
  onStatusChange,
  onSaveNotes,
  onDelete,
  onScoreFit,
  onTailorResume,
  onDownloadTailored,
}: {
  job: JobPublic;
  companyName: string;
  fit: JobFitResult | null;
  scoring: boolean;
  tailoringPlan: ResumeTailoringPlan | null;
  tailoring: boolean;
  onStatusChange: (next: JobStatus) => void;
  onSaveNotes: (notes: string, nextAction: string) => void;
  onDelete: () => void;
  onScoreFit: () => void;
  onTailorResume: () => void;
  onDownloadTailored: () => void;
}) {
  const [notes, setNotes] = useState(job.notes);
  const [nextAction, setNextAction] = useState(job.nextAction);

  return (
    <article className="article-card">
      <p className="eyebrow">
        {companyName}
        {job.location ? ` · ${job.location}` : ""}
        {job.workplaceType ? ` · ${job.workplaceType}` : ""}
        {job.fitScore !== null ? ` · Fit ${job.fitScore}/100` : ""}
      </p>
      <h3>{job.title}</h3>
      {job.technologies.length > 0 ? <p>{job.technologies.join(" · ")}</p> : null}

      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost" type="button" disabled={scoring} onClick={onScoreFit}>
          {scoring ? "Scoring…" : job.fitScore !== null ? "Rescore fit" : "Score fit"}
        </button>
        <button className="btn ghost" type="button" disabled={tailoring} onClick={onTailorResume}>
          {tailoring ? "Tailoring…" : "Tailor résumé"}
        </button>
        {tailoringPlan ? (
          <button className="btn ghost" type="button" onClick={onDownloadTailored}>
            Download tailored résumé
          </button>
        ) : null}
      </div>

      {tailoringPlan ? (
        <div className="notice">
          <p>{tailoringPlan.rationale}</p>
          <p className="status">
            Emphasizing: {tailoringPlan.topSkillsOrder.slice(0, 5).join(", ")}
          </p>
        </div>
      ) : null}

      {fit ? (
        <div className="notice">
          <p>
            <strong>{RECOMMENDATION_LABELS[fit.recommendation]}</strong> — overall {fit.overall}
            /100 (technical {fit.dimensions.technical}, seniority {fit.dimensions.seniority},
            architecture {fit.dimensions.architecture}, leadership {fit.dimensions.leadership})
          </p>
          {fit.strengths.length > 0 ? (
            <p>
              <strong>Strengths.</strong> {fit.strengths.join(" · ")}
            </p>
          ) : null}
          {fit.gaps.length > 0 ? (
            <p>
              <strong>Gaps.</strong> {fit.gaps.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="field full">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="field full">
        Next action
        <input value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
      </label>
      <div className="actions">
        <select
          value={job.status}
          onChange={(event) => onStatusChange(event.target.value as JobStatus)}
        >
          {JOB_STATUSES.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <button
          className="btn ghost"
          type="button"
          onClick={() => onSaveNotes(notes, nextAction)}
        >
          Save notes
        </button>
        <button className="btn ghost" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
}

function RecruiterCard({
  recruiter,
  companyName,
  relatedJobTitle,
  scoring,
  outreaching,
  outreachMessage,
  onConnectionChange,
  onSaveNotes,
  onScore,
  onPrepareOutreach,
  onDelete,
}: {
  recruiter: RecruiterPublic;
  companyName: string;
  relatedJobTitle: string | null;
  scoring: boolean;
  outreaching: boolean;
  outreachMessage: OutreachMessage | null;
  onConnectionChange: (next: RecruiterConnectionStatus) => void;
  onSaveNotes: (notes: string, nextAction: string) => void;
  onScore: () => void;
  onPrepareOutreach: () => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(recruiter.notes);
  const [nextAction, setNextAction] = useState(recruiter.nextAction);

  return (
    <article className="article-card">
      <p className="eyebrow">
        {companyName}
        {recruiter.role ? ` · ${recruiter.role}` : ""}
        {relatedJobTitle ? ` · re: ${relatedJobTitle}` : ""}
        {recruiter.relevanceScore !== null ? ` · Relevance ${recruiter.relevanceScore}/100` : ""}
      </p>
      <h3>{recruiter.name}</h3>
      {recruiter.linkedinUrl ? <p>{recruiter.linkedinUrl}</p> : null}

      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn ghost" type="button" disabled={scoring} onClick={onScore}>
          {scoring ? "Scoring…" : "Score relevance"}
        </button>
        <button className="btn ghost" type="button" disabled={outreaching} onClick={onPrepareOutreach}>
          {outreaching ? "Drafting…" : "Prepare outreach"}
        </button>
      </div>

      {outreachMessage ? (
        <div className="notice">
          <p>
            <strong>Connection note.</strong> {outreachMessage.connectionNote}
          </p>
          <p>
            <strong>Message.</strong> {outreachMessage.message}
          </p>
          <p className="status">
            Draft only — copy and send this yourself. Nothing here contacts the recruiter for you.
          </p>
        </div>
      ) : null}

      <label className="field full">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <label className="field full">
        Next action
        <input value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
      </label>
      <div className="actions">
        <select
          value={recruiter.connectionStatus}
          onChange={(event) => onConnectionChange(event.target.value as RecruiterConnectionStatus)}
        >
          {RECRUITER_CONNECTION_STATUSES.map((option) => (
            <option key={option} value={option}>
              {CONNECTION_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <button
          className="btn ghost"
          type="button"
          onClick={() => onSaveNotes(notes, nextAction)}
        >
          Save notes
        </button>
        <button className="btn ghost" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
}

function AnalyticsPanel({ analytics }: { analytics: CareerAnalytics }) {
  const tiles: Array<{ role: string; value: string; sub?: string }> = [
    { role: "Jobs tracked", value: String(analytics.totalJobs) },
    { role: "Applications", value: String(analytics.applications) },
    { role: "Interviews reached", value: String(analytics.interviewsReached) },
    { role: "Offers", value: String(analytics.offers) },
    {
      role: "Application → interview",
      value: analytics.applicationToInterviewRate === null ? "—" : `${analytics.applicationToInterviewRate}%`,
      sub: analytics.applications === 0 ? "no applications yet" : `of ${analytics.applications} applications`,
    },
    {
      role: "Rejection rate",
      value: analytics.rejectionRate === null ? "—" : `${analytics.rejectionRate}%`,
      sub: "of applications",
    },
    {
      role: "Average fit score",
      value: analytics.averageFitScore === null ? "—" : `${analytics.averageFitScore}/100`,
      sub: "of scored jobs",
    },
    { role: "Companies targeted", value: String(analytics.companiesTargeted) },
    {
      role: "Recruiter contacts",
      value: String(analytics.recruiterContacts),
      sub: `${analytics.recruitersConnected} connected`,
    },
  ];

  return (
    <section>
      <h3>Overview</h3>
      <div className="tech-stack-grid">
        {tiles.map((tile) => (
          <div className="tech-item" key={tile.role}>
            <p className="role">{tile.role}</p>
            <p className="name">{tile.value}</p>
            {tile.sub ? <p className="ver">{tile.sub}</p> : null}
          </div>
        ))}
      </div>

      {analytics.topTechnologies.length > 0 || analytics.topGaps.length > 0 ? (
        <div className="grid-2">
          {analytics.topTechnologies.length > 0 ? (
            <div>
              <p className="eyebrow">Most requested technologies</p>
              <p>
                {analytics.topTechnologies
                  .map((item) => `${item.technology} (${item.count})`)
                  .join(" · ")}
              </p>
            </div>
          ) : null}
          {analytics.topGaps.length > 0 ? (
            <div>
              <p className="eyebrow">Most common gaps (scored jobs)</p>
              <p>{analytics.topGaps.map((item) => `${item.skill} (${item.count})`).join(" · ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CompanyCard({
  company,
  importing,
  importResult,
  onImport,
}: {
  company: CompanyPublic;
  importing: boolean;
  importResult: { imported: number; skipped: number } | null;
  onImport: (boardToken: string) => void;
}) {
  const [boardToken, setBoardToken] = useState("");

  return (
    <article className="article-card">
      <h3>{company.name}</h3>
      {company.website ? <p>{company.website}</p> : null}

      <label className="field">
        Greenhouse board token
        <input
          value={boardToken}
          onChange={(event) => setBoardToken(event.target.value)}
          placeholder="e.g. nimbus (from boards.greenhouse.io/nimbus)"
        />
      </label>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button
          className="btn ghost"
          type="button"
          disabled={importing || !boardToken.trim()}
          onClick={() => onImport(boardToken.trim())}
        >
          {importing ? "Importing…" : "Import from Greenhouse"}
        </button>
      </div>
      {importResult ? (
        <p className="status">
          Imported {importResult.imported} new job{importResult.imported === 1 ? "" : "s"}
          {importResult.skipped > 0 ? ` · ${importResult.skipped} already tracked` : ""}
        </p>
      ) : null}
    </article>
  );
}
