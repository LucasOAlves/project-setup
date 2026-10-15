import type { JobBoardSource } from "@studio/shared";
import { AshbyJobProvider } from "./ashby-job-provider.js";
import { GreenhouseJobProvider } from "./greenhouse-job-provider.js";
import type { JobProvider } from "./job-provider.js";
import { LeverJobProvider } from "./lever-job-provider.js";
import { SmartRecruitersJobProvider } from "./smartrecruiters-job-provider.js";
import { WorkableJobProvider } from "./workable-job-provider.js";

// One board adapter per ATS, shared by the API (manual board import) and the worker (watchlist).
export function createBoardProviders(): Record<JobBoardSource, JobProvider> {
  return {
    greenhouse: new GreenhouseJobProvider(),
    lever: new LeverJobProvider(),
    ashby: new AshbyJobProvider(),
    workable: new WorkableJobProvider(),
    smartrecruiters: new SmartRecruitersJobProvider(),
  };
}
