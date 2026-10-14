import { z } from "zod";
import { JOB_SEARCH_SOURCES, type JobSearchSource } from "./career.js";

// Catalog of job sites (Job Hunter, Milestone 1.5): every site on the user's list, classified by
// how it can take part in the search. Only sites whose terms allow automated reading become
// discovery sources; the rest are opened by the user, and talent platforms, where you build a
// profile once and get matched, are tracked as a checklist.
//   AUTOMATIC        — read by daily discovery (sourceId names the adapter)
//   TALENT_PLATFORM  — one-time profile and vetting, then they offer roles
//   LINK_OUT         — browse on the site: no feed, a login, or terms that do not allow reuse
//   FREELANCE        — project marketplaces, outside the full-time target
//   NOT_A_JOB_SOURCE — on the list, but not a place to find roles
export const JOB_SITE_KINDS = ["AUTOMATIC", "TALENT_PLATFORM", "LINK_OUT", "FREELANCE", "NOT_A_JOB_SOURCE"] as const;
export type JobSiteKind = (typeof JOB_SITE_KINDS)[number];

export type JobSite = {
  id: string;
  name: string;
  url: string;
  kind: JobSiteKind;
  sourceId?: JobSearchSource;
  note: string;
};

export const JOB_SITES: readonly JobSite[] = [
  { id: "weworkremotely", name: "We Work Remotely", url: "https://weworkremotely.com/", kind: "AUTOMATIC", sourceId: "weworkremotely", note: "Public RSS feed of programming jobs, read daily." },
  { id: "remoteok", name: "Remote OK", url: "https://remoteok.com/", kind: "AUTOMATIC", sourceId: "remoteok", note: "Public API, read daily." },
  { id: "remotive", name: "Remotive", url: "https://remotive.com/", kind: "AUTOMATIC", sourceId: "remotive", note: "Public API, read daily. Listings appear 24 hours late." },
  { id: "himalayas", name: "Himalayas", url: "https://himalayas.app/", kind: "AUTOMATIC", sourceId: "himalayas", note: "Public API, read daily. Not on the original list, already wired in." },

  { id: "turing", name: "Turing", url: "https://www.turing.com/", kind: "TALENT_PLATFORM", note: "Vetting tests, then matched to long-term contracts." },
  { id: "toptal", name: "Toptal", url: "https://www.toptal.com/", kind: "TALENT_PLATFORM", note: "Multi-step screening, then matched to clients." },
  { id: "arc", name: "Arc.dev", url: "https://arc.dev/dashboard/d/full-time-jobs/browse", kind: "TALENT_PLATFORM", note: "Profile and vetting. Also lists full-time remote roles once signed in." },
  { id: "revelo", name: "Revelo", url: "https://www.revelo.com.br/", kind: "TALENT_PLATFORM", note: "Latin American talent for US companies." },
  { id: "strider", name: "Strider", url: "https://www.onstrider.com/jobs", kind: "TALENT_PLATFORM", note: "Latin American engineers placed with US companies." },
  { id: "proxify", name: "Proxify", url: "https://proxify.io/", kind: "TALENT_PLATFORM", note: "Vetted developer network." },
  { id: "insquad", name: "Insquad", url: "https://dev.insquad.com/#vacancy", kind: "TALENT_PLATFORM", note: "Vetted developer network." },
  { id: "vanhack", name: "VanHack", url: "https://vanhack.com/jobs", kind: "TALENT_PLATFORM", note: "Profile first. Many roles are relocation, check each one." },
  { id: "lhh-hired", name: "LHH Hired", url: "https://www.lhh.com/us/en/hired/", kind: "TALENT_PLATFORM", note: "Recruiter-led marketplace." },
  { id: "flohiring", name: "Flo Hiring", url: "https://www.flohiring.com/", kind: "TALENT_PLATFORM", note: "Recruiting partner, apply through their roles." },
  { id: "vigil", name: "Vigil", url: "https://vigil.global/careers/#recruiting", kind: "TALENT_PLATFORM", note: "Recruiting and staffing, apply through their careers page." },
  { id: "nearsure", name: "Nearsure", url: "https://nearsure.com/en/careers/job-opportunities/", kind: "TALENT_PLATFORM", note: "Nearshore staffing for US clients." },
  { id: "jobsity", name: "Jobsity", url: "https://careers.jobsity.com/", kind: "TALENT_PLATFORM", note: "Nearshore staffing for US clients." },
  { id: "clevertech", name: "Clevertech", url: "https://clevertech.biz/jobs", kind: "TALENT_PLATFORM", note: "Fully remote consultancy, apply to their open roles." },
  { id: "scalablepath", name: "Scalable Path", url: "https://www.scalablepath.com/", kind: "TALENT_PLATFORM", note: "Freelance network, vetted profile." },
  { id: "zipdev", name: "Zipdev", url: "https://zipdev.com/careers/", kind: "TALENT_PLATFORM", note: "Nearshore staffing for US clients." },
  { id: "webcreek", name: "Webcreek", url: "https://careers.webcreek.com/", kind: "TALENT_PLATFORM", note: "Nearshore staffing, apply through their careers page." },
  { id: "epam-anywhere", name: "EPAM Anywhere", url: "https://anywhere.epam.com/en/jobs", kind: "TALENT_PLATFORM", note: "EPAM's remote program, profile then project matching." },

  { id: "wellfound", name: "Wellfound", url: "https://wellfound.com/", kind: "LINK_OUT", note: "Startup jobs. Needs a login." },
  { id: "flexjobs", name: "FlexJobs", url: "https://www.flexjobs.com/", kind: "LINK_OUT", note: "Paid subscription." },
  { id: "otta", name: "Otta (Welcome to the Jungle)", url: "https://otta.com/", kind: "LINK_OUT", note: "Needs a login." },
  { id: "remoterocketship", name: "Remote Rocketship", url: "https://www.remoterocketship.com/?page=1&sort=DateAdded", kind: "LINK_OUT", note: "Opens sorted by newest." },
  { id: "jobgether", name: "Jobgether", url: "https://jobgether.com/", kind: "LINK_OUT", note: "Remote job aggregator with location filters." },
  { id: "remotetechjobs", name: "RemoteTechJobs", url: "https://remotetechjobs.com/", kind: "LINK_OUT", note: "" },
  { id: "simplyhired", name: "SimplyHired", url: "https://www.simplyhired.com/", kind: "LINK_OUT", note: "General job search, filter by remote." },
  { id: "devremote", name: "DevRemote", url: "https://devremote.io/", kind: "LINK_OUT", note: "" },
  { id: "justremote", name: "JustRemote", url: "https://justremote.co/", kind: "LINK_OUT", note: "" },
  { id: "nodesk", name: "NoDesk", url: "https://nodesk.co/", kind: "LINK_OUT", note: "" },
  { id: "found", name: "Found.dev", url: "https://found.dev/", kind: "LINK_OUT", note: "" },
  { id: "metait", name: "Metait", url: "https://metait.ai/", kind: "LINK_OUT", note: "" },
  { id: "cryptojobslist", name: "CryptoJobsList", url: "https://cryptojobslist.com/", kind: "LINK_OUT", note: "Crypto and web3 roles." },
  { id: "landing-jobs", name: "Landing.jobs", url: "https://landing.jobs/jobs", kind: "LINK_OUT", note: "Strong in Europe, check the remote filter." },
  { id: "programathor", name: "ProgramaThor", url: "https://programathor.com.br/", kind: "LINK_OUT", note: "Brazilian tech jobs, some international." },
  { id: "jobspresso", name: "Jobspresso", url: "https://jobspresso.co/", kind: "LINK_OUT", note: "No feed or API, and its content is all rights reserved." },
  { id: "workingnomads", name: "Working Nomads", url: "https://www.workingnomads.com/jobs", kind: "LINK_OUT", note: "Has a JSON endpoint but publishes no terms for reusing it." },

  { id: "upwork", name: "Upwork", url: "https://www.upwork.com/freelance-jobs/software-development/", kind: "FREELANCE", note: "" },
  { id: "workana", name: "Workana", url: "https://www.workana.com/", kind: "FREELANCE", note: "Latin American freelance marketplace." },
  { id: "freelancer", name: "Freelancer", url: "https://www.freelancer.com/jobs/software-development", kind: "FREELANCE", note: "" },
  { id: "peopleperhour", name: "PeoplePerHour", url: "https://www.peopleperhour.com/", kind: "FREELANCE", note: "" },

  { id: "deel", name: "Deel", url: "https://www.deel.com/", kind: "NOT_A_JOB_SOURCE", note: "A service companies use to hire abroad. A posting that mentions Deel counts as a signal it can hire from Brazil." },
];

// Talent-platform checklist: where the user stands on each platform.
export const TALENT_PROFILE_STATUSES = ["NOT_STARTED", "APPLIED", "IN_REVIEW", "APPROVED", "REJECTED", "NOT_INTERESTED"] as const;
export type TalentProfileStatus = (typeof TALENT_PROFILE_STATUSES)[number];

export const talentProfileInputSchema = z.object({
  status: z.enum(TALENT_PROFILE_STATUSES),
  note: z.string().trim().max(1000).default(""),
});
export type TalentProfileInput = z.infer<typeof talentProfileInputSchema>;

export const talentProfilePublicSchema = talentProfileInputSchema.extend({
  siteId: z.string(),
  updatedAt: z.string(),
});
export type TalentProfilePublic = z.infer<typeof talentProfilePublicSchema>;

export function isTalentPlatform(siteId: string): boolean {
  return JOB_SITES.some((site) => site.id === siteId && site.kind === "TALENT_PLATFORM");
}

// Every automatic site must name a real search adapter.
export function automaticSourcesAreKnown(): boolean {
  return JOB_SITES.every(
    (site) => site.kind !== "AUTOMATIC" || (site.sourceId !== undefined && JOB_SEARCH_SOURCES.includes(site.sourceId)),
  );
}
