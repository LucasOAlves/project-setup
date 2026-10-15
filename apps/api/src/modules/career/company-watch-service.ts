import type { CompanyWatchInput, CompanyWatchPublic, CompanyWatchStatus, JobBoardSource } from "@studio/shared";
import { AppError, notFound } from "../../app-error.js";
import type { CareerRepository, CompanyWatchRow } from "./career-repository.js";
import { HIRING_FAST_MIN_RECENT, hiringPace, isPollDue } from "./company-watch.js";
import type { JobIntake } from "./job-intake.js";
import type { JobProvider } from "./job-provider.js";
import type { SourceGate } from "./source-registry.js";

// Target-company watchlist (Milestone 1.5): "hunt companies, not vacancies". The user names
// the companies they want; each one's own ATS board is read daily by the worker, through the
// same import path as a manual board import, and new jobs go through eligibility and the
// evaluation queue like discovered ones. A poll never runs more often than once an hour.

export type WatchPollResult = {
  companyId: string;
  status: "POLLED" | "SKIPPED_RECENT" | "NOT_WATCHED";
  fetched: number;
  created: number;
  alreadyImported: number;
  duplicates: number;
  excluded: number;
  queuedForEvaluation: number;
  hiringFast: boolean;
};

export type CompanyWatchPollerDeps = {
  repo: CareerRepository;
  intake: JobIntake;
  providers: Record<JobBoardSource, JobProvider>;
  sourceGate: SourceGate;
  queueEvaluation: (jobId: string, profileVersion: number) => Promise<void>;
};

function toPublic(row: CompanyWatchRow, companyName: string): CompanyWatchPublic {
  return {
    companyId: row.companyId,
    companyName,
    source: row.source as JobBoardSource,
    boardToken: row.boardToken,
    lastPolledAt: row.lastPolledAt?.toISOString() ?? null,
    lastStatus: row.lastStatus as CompanyWatchStatus,
    lastError: row.lastError,
    openPostings: row.openPostings,
    recentPostings: row.recentPostings,
    newPostings: row.newPostings,
    hiringFast: (row.recentPostings ?? 0) >= HIRING_FAST_MIN_RECENT,
  };
}

// The API side: what the user manages. Polling itself runs in the worker (CompanyWatchPoller).
export class CompanyWatchService {
  constructor(private readonly repo: CareerRepository) {}

  async list(): Promise<CompanyWatchPublic[]> {
    const [rows, companies] = await Promise.all([this.repo.listCompanyWatches(), this.repo.listCompanies()]);
    const names = new Map(companies.map((company) => [company.id, company.name]));
    return rows.map((row) => toPublic(row, names.get(row.companyId) ?? ""));
  }

  async watch(companyId: string, input: CompanyWatchInput): Promise<CompanyWatchPublic> {
    const company = await this.repo.getCompany(companyId);
    if (!company) {
      throw notFound("That company does not exist.");
    }
    const row = await this.repo.upsertCompanyWatch({ companyId, ...input });
    return toPublic(row, company.name);
  }

  async unwatch(companyId: string): Promise<void> {
    if (!(await this.repo.deleteCompanyWatch(companyId))) {
      throw notFound("That company is not on the watchlist.");
    }
  }

  async isWatched(companyId: string): Promise<boolean> {
    return (await this.repo.getCompanyWatch(companyId)) !== null;
  }
}

export class CompanyWatchPoller {
  constructor(private readonly deps: CompanyWatchPollerDeps) {}

  async watchedCompanyIds(): Promise<string[]> {
    return (await this.deps.repo.listCompanyWatches()).map((row) => row.companyId);
  }

  async poll(companyId: string, now = new Date()): Promise<WatchPollResult> {
    const result: WatchPollResult = {
      companyId,
      status: "NOT_WATCHED",
      fetched: 0,
      created: 0,
      alreadyImported: 0,
      duplicates: 0,
      excluded: 0,
      queuedForEvaluation: 0,
      hiringFast: false,
    };
    const [watch, company] = await Promise.all([
      this.deps.repo.getCompanyWatch(companyId),
      this.deps.repo.getCompany(companyId),
    ]);
    if (!watch || !company) return result;
    if (!isPollDue(watch.lastPolledAt, now)) return { ...result, status: "SKIPPED_RECENT" };

    const source = watch.source as JobBoardSource;
    let postings;
    try {
      await this.deps.sourceGate.assertDiscoveryAllowed(source);
      postings = await this.deps.providers[source].listJobs(watch.boardToken);
    } catch (error) {
      const message = error instanceof AppError ? error.message : "The board could not be read.";
      await this.deps.repo.recordCompanyWatchPoll(companyId, { status: "FAILED", polledAt: now, error: message });
      throw error;
    }

    result.status = "POLLED";
    result.fetched = postings.length;
    for (const posting of postings) {
      const { job, outcome } = await this.deps.intake.importBoardPosting(source, posting, company);
      if (outcome === "ALREADY_IMPORTED") {
        result.alreadyImported += 1;
        continue;
      }
      if (outcome === "DUPLICATE") {
        result.duplicates += 1;
        continue;
      }
      result.created += 1;
      const evaluation = await this.deps.intake.evaluateEligibility(job);
      if (evaluation.eligibility === "EXCLUDED") {
        result.excluded += 1;
        continue;
      }
      await this.deps.queueEvaluation(job.id, evaluation.profileVersion);
      result.queuedForEvaluation += 1;
    }

    const pace = hiringPace(
      postings.map((posting) => posting.postedAt ?? null),
      now,
    );
    result.hiringFast = pace.hiringFast;
    await this.deps.repo.recordCompanyWatchPoll(companyId, {
      status: "OK",
      polledAt: now,
      openPostings: pace.open,
      recentPostings: pace.recent,
      newPostings: result.created,
    });
    return result;
  }
}
