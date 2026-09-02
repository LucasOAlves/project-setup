import { useEffect, useState } from "react";
import {
  JOB_EMPLOYMENT_TYPES,
  JOB_STATUSES,
  JOB_WORKPLACE_TYPES,
  type CompanyPublic,
  type JobEmploymentType,
  type JobFitResult,
  type JobPublic,
  type JobStatus,
  type JobWorkplaceType,
} from "@studio/shared";
import {
  computeJobFit,
  createCompany,
  createJob,
  deleteJob,
  fetchCompanies,
  fetchJobs,
  patchJob,
  updateJobStatus,
  type ApiError,
} from "./api";
import { TagInput } from "./TagInput";

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

export function CareerView() {
  const [companies, setCompanies] = useState<CompanyPublic[]>([]);
  const [jobs, setJobs] = useState<JobPublic[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [jobForm, setJobForm] = useState(emptyJobForm());
  const [fitResults, setFitResults] = useState<Record<string, JobFitResult>>({});
  const [scoringJobId, setScoringJobId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCompanies(), fetchJobs()])
      .then(([existingCompanies, existingJobs]) => {
        if (cancelled) return;
        setCompanies(existingCompanies);
        setJobs(existingJobs);
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
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setScoringJobId(null);
    }
  }

  async function removeJob(id: string) {
    setError(null);
    try {
      setJobs(await deleteJob(id));
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
            <article className="article-card" key={company.id}>
              <h3>{company.name}</h3>
              {company.website ? <p>{company.website}</p> : null}
            </article>
          ))}
        </div>
      )}

      <h3>Jobs</h3>
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
              onStatusChange={(next) => void markStatus(job.id, next)}
              onSaveNotes={(notes, nextAction) => void saveNotes(job.id, notes, nextAction)}
              onDelete={() => void removeJob(job.id)}
              onScoreFit={() => void scoreFit(job.id)}
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
  onStatusChange,
  onSaveNotes,
  onDelete,
  onScoreFit,
}: {
  job: JobPublic;
  companyName: string;
  fit: JobFitResult | null;
  scoring: boolean;
  onStatusChange: (next: JobStatus) => void;
  onSaveNotes: (notes: string, nextAction: string) => void;
  onDelete: () => void;
  onScoreFit: () => void;
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
      </div>

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
