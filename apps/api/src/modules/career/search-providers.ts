import type { JobSearchSource } from "@studio/shared";
import type { Env } from "../../env.js";
import { AdzunaJobSearchProvider } from "./adzuna-job-search-provider.js";
import { ArbeitnowJobSearchProvider } from "./arbeitnow-job-search-provider.js";
import { HimalayasJobSearchProvider } from "./himalayas-job-search-provider.js";
import type { JobSearchProvider } from "./job-search-provider.js";
import { RemoteOkJobSearchProvider } from "./remoteok-job-search-provider.js";
import { RemotiveJobSearchProvider } from "./remotive-job-search-provider.js";

// One place that wires the search adapters, shared by the API and the discovery worker.
export function createSearchProviders(env: Env): Record<JobSearchSource, JobSearchProvider> {
  return {
    remoteok: new RemoteOkJobSearchProvider(),
    arbeitnow: new ArbeitnowJobSearchProvider(),
    adzuna: new AdzunaJobSearchProvider(env.ADZUNA_APP_ID, env.ADZUNA_APP_KEY),
    remotive: new RemotiveJobSearchProvider(),
    himalayas: new HimalayasJobSearchProvider(),
  };
}
