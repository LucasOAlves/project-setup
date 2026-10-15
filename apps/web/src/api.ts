import type {
  ApplicationInbox,
  SourcePublic,
  SourceApplicationMode,
  AngleType,
  CompanyInput,
  CompanyPublic,
  CompanyWatchPublic,
  ContentPlanStatus,
  ContentPlanTopic,
  ContentPlanTopicPublic,
  CustomTopicInput,
  CustomTopicPublic,
  ExperienceInput,
  CareerAnalytics,
  ContentTopicSuggestion,
  ImageProviderName,
  ImagePublic,
  JobBoardSource,
  JobFitResult,
  JobInput,
  JobPatchInput,
  JobPublic,
  JobSearchResult,
  JobSearchSource,
  JobStatus,
  OpportunitySetPublic,
  OutreachMessage,
  RecruiterConnectionStatus,
  RecruiterInput,
  RecruiterPatchInput,
  RecruiterPublic,
  ResumeTailoringPlan,
  PersonaPublic,
  PostHistoryPublic,
  PostHistoryQuery,
  PostPublic,
  PostSectionComment,
  PostTrackingInput,
  ProfileInput,
  ProfilePublic,
  ResearchRunPublic,
  ResumeDraft,
  SectionCommentReview,
  TextProviderName,
  WritingTone,
  FeedEligibilityFilter,
  FeedbackSummary,
  JobEvaluationPublic,
  JobFeedbackInput,
  JobFeedbackPublic,
  JobFeedItem,
  TalentProfileInput,
  ApplicationDocumentPublic,
  ApplicationAnswersInput,
  ApplicationPublic,
  CoverLetterEdit,
  ApplicationAnswersEdit,
  ApplicationDetailsInput,
  ApplicationDetailsPublic,
  TalentProfilePublic,
} from "@studio/shared";
import { profileInputSchema } from "@studio/shared";

export type ApiError = {
  code: string;
  message: string;
};

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: ApiError };
    if (body.error?.message) {
      return body.error;
    }
  } catch {
    // Fall through to a generic message.
  }
  return { code: "UNKNOWN", message: "The request failed." };
}

export async function fetchProfile(): Promise<ProfilePublic | null> {
  const response = await fetch("/api/profile");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { profile: ProfilePublic | null };
  return body.profile;
}

export async function saveProfile(input: ProfileInput): Promise<ProfilePublic> {
  const payload = profileInputSchema.parse(input);
  const response = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { profile: ProfilePublic };
  return body.profile;
}

export async function uploadPhoto(file: File): Promise<ProfilePublic> {
  const data = new FormData();
  data.append("file", file);
  const response = await fetch("/api/profile/photos", {
    method: "POST",
    body: data,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { profile: ProfilePublic };
  return body.profile;
}

export async function deletePhoto(photoId: string): Promise<ProfilePublic> {
  const response = await fetch(`/api/profile/photos/${photoId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { profile: ProfilePublic };
  return body.profile;
}

export async function extractResumeDraft(
  file: File,
  provider?: TextProviderName,
): Promise<ResumeDraft> {
  const data = new FormData();
  data.append("file", file);
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const response = await fetch(`/api/profile/resume/extract${query}`, {
    method: "POST",
    body: data,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { draft: ResumeDraft };
  return body.draft;
}

export async function downloadResumePdf(): Promise<void> {
  const response = await fetch("/api/profile/resume/export");
  if (!response.ok) {
    throw await parseError(response);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "resume.pdf";
  link.click();
  URL.revokeObjectURL(url);
}

export async function fetchPersona(): Promise<PersonaPublic | null> {
  const response = await fetch("/api/persona");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { persona: PersonaPublic | null };
  return body.persona;
}

export async function generatePersona(provider?: TextProviderName): Promise<PersonaPublic> {
  const response = await fetch("/api/persona/generate", {
    method: "POST",
    headers: provider ? { "Content-Type": "application/json" } : undefined,
    body: provider ? JSON.stringify({ provider }) : undefined,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { persona: PersonaPublic };
  return body.persona;
}

export async function fetchResearch(): Promise<ResearchRunPublic | null> {
  const response = await fetch("/api/research");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { research: ResearchRunPublic | null };
  return body.research;
}

export async function discoverResearch(): Promise<ResearchRunPublic> {
  const response = await fetch("/api/research/discover", { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { research: ResearchRunPublic };
  return body.research;
}

export async function fetchOpportunities(): Promise<OpportunitySetPublic | null> {
  const response = await fetch("/api/opportunities");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { opportunities: OpportunitySetPublic | null };
  return body.opportunities;
}

export async function fetchSelectedOpportunities(): Promise<OpportunitySetPublic | null> {
  const response = await fetch("/api/opportunities/selected");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { opportunities: OpportunitySetPublic | null };
  return body.opportunities;
}

export async function generateOpportunities(
  provider?: TextProviderName,
): Promise<OpportunitySetPublic> {
  const response = await fetch("/api/opportunities/generate", {
    method: "POST",
    headers: provider ? { "Content-Type": "application/json" } : undefined,
    body: provider ? JSON.stringify({ provider }) : undefined,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { opportunities: OpportunitySetPublic };
  return body.opportunities;
}

export async function selectOpportunity(opportunityId: string): Promise<OpportunitySetPublic> {
  const response = await fetch(`/api/opportunities/${opportunityId}/select`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { opportunities: OpportunitySetPublic };
  return body.opportunities;
}

export async function fetchPost(): Promise<PostPublic | null> {
  const response = await fetch("/api/posts");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { post: PostPublic | null };
  return body.post;
}

async function postAction(path: string, payload?: unknown): Promise<PostPublic> {
  const response = await fetch(path, {
    method: "POST",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { post: PostPublic };
  return body.post;
}

export function generatePost(
  opportunityId?: string,
  provider?: TextProviderName,
): Promise<PostPublic> {
  return postAction("/api/posts/generate", { opportunityId, provider });
}

export function generateAlternativeHook(
  postId?: string,
  provider?: TextProviderName,
): Promise<PostPublic> {
  return postAction("/api/posts/hook", { postId, provider });
}

export function applyImprovements(
  postId?: string,
  provider?: TextProviderName,
): Promise<PostPublic> {
  return postAction("/api/posts/improve", { postId, provider });
}

export function changePostTone(
  tone: WritingTone,
  postId?: string,
  provider?: TextProviderName,
): Promise<PostPublic> {
  return postAction("/api/posts/tone", { tone, postId, provider });
}

export function changePostAngle(
  angle: AngleType,
  postId?: string,
  provider?: TextProviderName,
): Promise<PostPublic> {
  return postAction("/api/posts/angle", { angle, postId, provider });
}

export function applySectionComments(
  sectionComments: PostSectionComment[],
  postId?: string,
  provider?: TextProviderName,
): Promise<PostPublic> {
  return postAction("/api/posts/rewrite", { sectionComments, postId, provider });
}

export async function reviewSectionComments(
  sectionComments: PostSectionComment[],
  provider?: TextProviderName,
): Promise<SectionCommentReview[]> {
  const response = await fetch("/api/posts/section-comments/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sectionComments, provider }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { reviews: SectionCommentReview[] };
  return body.reviews;
}

export async function addExperience(experience: ExperienceInput): Promise<ProfilePublic> {
  const response = await fetch("/api/profile/experiences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(experience),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { profile: ProfilePublic };
  return body.profile;
}

export async function fetchPostHistory(
  query: Partial<PostHistoryQuery>,
): Promise<PostHistoryPublic> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.q) params.set("q", query.q);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDir) params.set("sortDir", query.sortDir);
  if (query.opportunityId) params.set("opportunityId", query.opportunityId);

  const response = await fetch(`/api/posts/history?${params.toString()}`);
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as PostHistoryPublic;
}

export async function fetchPostById(id: string): Promise<PostPublic | null> {
  const response = await fetch(`/api/posts/${id}`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { post: PostPublic | null };
  return body.post;
}

export async function updatePostTracking(
  id: string,
  patch: PostTrackingInput,
): Promise<PostPublic> {
  const response = await fetch(`/api/posts/${id}/tracking`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { post: PostPublic };
  return body.post;
}

export function emptyProfile(): ProfileInput {
  return profileInputSchema.parse({});
}

export async function fetchPostImage(postId: string): Promise<ImagePublic | null> {
  const response = await fetch(`/api/posts/${postId}/image`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { image: ImagePublic | null };
  return body.image;
}

export async function generateImage(
  postId?: string,
  textProvider?: TextProviderName,
  imageProvider?: ImageProviderName,
): Promise<ImagePublic> {
  const response = await fetch("/api/images/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, textProvider, imageProvider }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { image: ImagePublic };
  return body.image;
}

export async function fetchContentPlan(): Promise<ContentPlanTopicPublic[]> {
  const response = await fetch("/api/content-plan");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: ContentPlanTopicPublic[] };
  return body.topics;
}

export async function selectContentPlanTopic(topicId: string): Promise<OpportunitySetPublic> {
  const response = await fetch(`/api/content-plan/${topicId}/select`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { opportunities: OpportunitySetPublic };
  return body.opportunities;
}

export async function extractPlanDocument(
  file: File,
  provider?: TextProviderName,
): Promise<ContentPlanTopic[]> {
  const data = new FormData();
  data.append("file", file);
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const response = await fetch(`/api/content-plan/upload/extract${query}`, {
    method: "POST",
    body: data,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: ContentPlanTopic[] };
  return body.topics;
}

export async function savePlanTopics(
  topics: ContentPlanTopic[],
  sourceFilename: string,
): Promise<ContentPlanTopicPublic[]> {
  const response = await fetch("/api/content-plan/upload/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics, sourceFilename }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: ContentPlanTopicPublic[] };
  return body.topics;
}

export async function updateContentPlanTopicStatus(
  topicId: string,
  status: ContentPlanStatus,
): Promise<ContentPlanTopicPublic[]> {
  const response = await fetch(`/api/content-plan/${topicId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: ContentPlanTopicPublic[] };
  return body.topics;
}

export async function fetchCustomTopics(): Promise<CustomTopicPublic[]> {
  const response = await fetch("/api/custom-topics");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: CustomTopicPublic[] };
  return body.topics;
}

export async function createCustomTopic(input: CustomTopicInput): Promise<CustomTopicPublic> {
  const response = await fetch("/api/custom-topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topic: CustomTopicPublic };
  return body.topic;
}

export async function deleteCustomTopic(id: string): Promise<CustomTopicPublic[]> {
  const response = await fetch(`/api/custom-topics/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: CustomTopicPublic[] };
  return body.topics;
}

export async function selectCustomTopic(id: string): Promise<OpportunitySetPublic> {
  const response = await fetch(`/api/custom-topics/${id}/select`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { opportunities: OpportunitySetPublic };
  return body.opportunities;
}

export async function updateCustomTopicStatus(
  id: string,
  status: ContentPlanStatus,
): Promise<CustomTopicPublic[]> {
  const response = await fetch(`/api/custom-topics/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { topics: CustomTopicPublic[] };
  return body.topics;
}

export async function fetchCareerAnalytics(): Promise<CareerAnalytics> {
  const response = await fetch("/api/career/analytics");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { analytics: CareerAnalytics };
  return body.analytics;
}

export async function fetchContentSuggestions(): Promise<ContentTopicSuggestion[]> {
  const response = await fetch("/api/career/content-suggestions");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { suggestions: ContentTopicSuggestion[] };
  return body.suggestions;
}

export async function fetchCompanies(): Promise<CompanyPublic[]> {
  const response = await fetch("/api/career/companies");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { companies: CompanyPublic[] };
  return body.companies;
}

export async function importFromBoard(
  companyId: string,
  source: JobBoardSource,
  boardToken: string,
): Promise<{ imported: JobPublic[]; skipped: number }> {
  const response = await fetch(`/api/career/companies/${companyId}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, boardToken }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as { imported: JobPublic[]; skipped: number };
}

export async function fetchWatchlist(): Promise<CompanyWatchPublic[]> {
  const response = await fetch("/api/career/watchlist");
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { watches: CompanyWatchPublic[] }).watches;
}

export async function watchCompany(
  companyId: string,
  source: JobBoardSource,
  boardToken: string,
): Promise<CompanyWatchPublic> {
  const response = await fetch(`/api/career/companies/${companyId}/watch`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, boardToken }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { watch: CompanyWatchPublic }).watch;
}

export async function unwatchCompany(companyId: string): Promise<void> {
  const response = await fetch(`/api/career/companies/${companyId}/watch`, { method: "DELETE" });
  if (!response.ok) {
    throw await parseError(response);
  }
}

export async function checkWatchNow(companyId: string): Promise<"QUEUED" | "ALREADY_QUEUED_THIS_HOUR"> {
  const response = await fetch(`/api/career/companies/${companyId}/watch/check`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { status: "QUEUED" | "ALREADY_QUEUED_THIS_HOUR" }).status;
}

export async function fetchApplicationDetails(): Promise<ApplicationDetailsPublic | null> {
  const response = await fetch("/api/profile/application-details");
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { details: ApplicationDetailsPublic | null }).details;
}

export async function saveApplicationDetails(input: ApplicationDetailsInput): Promise<ApplicationDetailsPublic> {
  const response = await fetch("/api/profile/application-details", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { details: ApplicationDetailsPublic }).details;
}

export type DocumentSaveResult = { document: ApplicationDocumentPublic; created: boolean };

export async function fetchJobDocuments(jobId: string): Promise<ApplicationDocumentPublic[]> {
  const response = await fetch(`/api/career/jobs/${jobId}/documents`);
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { documents: ApplicationDocumentPublic[] }).documents;
}

async function postDocument(path: string, body: unknown): Promise<DocumentSaveResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as DocumentSaveResult;
}

export function generateCv(jobId: string): Promise<DocumentSaveResult> {
  return postDocument(`/api/career/jobs/${jobId}/documents/cv`, {});
}

export function generateCoverLetter(jobId: string): Promise<DocumentSaveResult> {
  return postDocument(`/api/career/jobs/${jobId}/documents/cover-letter`, {});
}

export function saveCoverLetterEdit(jobId: string, edit: CoverLetterEdit): Promise<DocumentSaveResult> {
  return postDocument(`/api/career/jobs/${jobId}/documents/cover-letter/edits`, edit);
}

export function generateAnswers(jobId: string): Promise<DocumentSaveResult> {
  return postDocument(`/api/career/jobs/${jobId}/documents/answers`, {});
}

export function saveAnswersEdit(jobId: string, edit: ApplicationAnswersEdit): Promise<DocumentSaveResult> {
  return postDocument(`/api/career/jobs/${jobId}/documents/answers/edits`, edit);
}

export function documentFileUrl(documentId: string): string {
  return `/api/career/documents/${documentId}/file`;
}

export async function fetchTalentProfiles(): Promise<TalentProfilePublic[]> {
  const response = await fetch("/api/career/job-sites/profiles");
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { profiles: TalentProfilePublic[] }).profiles;
}

export async function saveTalentProfile(siteId: string, input: TalentProfileInput): Promise<TalentProfilePublic> {
  const response = await fetch(`/api/career/job-sites/${encodeURIComponent(siteId)}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { profile: TalentProfilePublic }).profile;
}

export async function searchJobs(
  source: JobSearchSource,
  keywords: string,
  location?: string,
): Promise<JobSearchResult[]> {
  const response = await fetch("/api/career/jobs/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, keywords, location }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { postings: JobSearchResult[] };
  return body.postings;
}

export async function importSearchResult(
  source: JobSearchSource,
  posting: JobSearchResult,
): Promise<JobPublic> {
  const response = await fetch("/api/career/jobs/search/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, posting }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { job: JobPublic };
  return body.job;
}

export async function createCompany(input: CompanyInput): Promise<CompanyPublic> {
  const response = await fetch("/api/career/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { company: CompanyPublic };
  return body.company;
}

export async function fetchJobs(): Promise<JobPublic[]> {
  const response = await fetch("/api/career/jobs");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { jobs: JobPublic[] };
  return body.jobs;
}

export async function createJob(input: JobInput): Promise<JobPublic> {
  const response = await fetch("/api/career/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { job: JobPublic };
  return body.job;
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<JobPublic> {
  const response = await fetch(`/api/career/jobs/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { job: JobPublic };
  return body.job;
}

export async function patchJob(id: string, patch: JobPatchInput): Promise<JobPublic> {
  const response = await fetch(`/api/career/jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { job: JobPublic };
  return body.job;
}

export async function computeJobFit(id: string): Promise<JobFitResult> {
  const response = await fetch(`/api/career/jobs/${id}/fit`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { fit: JobFitResult };
  return body.fit;
}

export async function generateResumeTailoringPlan(
  id: string,
  provider?: TextProviderName,
): Promise<ResumeTailoringPlan> {
  const response = await fetch(`/api/career/jobs/${id}/resume-tailoring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { plan: ResumeTailoringPlan };
  return body.plan;
}

export async function downloadTailoredResume(
  jobId: string,
  plan: ResumeTailoringPlan,
): Promise<void> {
  const response = await fetch(`/api/career/jobs/${jobId}/resume-tailoring/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tailored-resume.pdf";
  link.click();
  URL.revokeObjectURL(url);
}

export async function fetchRecruiters(): Promise<RecruiterPublic[]> {
  const response = await fetch("/api/career/recruiters");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { recruiters: RecruiterPublic[] };
  return body.recruiters;
}

export async function createRecruiter(input: RecruiterInput): Promise<RecruiterPublic> {
  const response = await fetch("/api/career/recruiters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { recruiter: RecruiterPublic };
  return body.recruiter;
}

export async function updateRecruiterConnectionStatus(
  id: string,
  connectionStatus: RecruiterConnectionStatus,
): Promise<RecruiterPublic> {
  const response = await fetch(`/api/career/recruiters/${id}/connection`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionStatus }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { recruiter: RecruiterPublic };
  return body.recruiter;
}

export async function patchRecruiter(
  id: string,
  patch: RecruiterPatchInput,
): Promise<RecruiterPublic> {
  const response = await fetch(`/api/career/recruiters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { recruiter: RecruiterPublic };
  return body.recruiter;
}

export async function scoreRecruiter(id: string): Promise<RecruiterPublic> {
  const response = await fetch(`/api/career/recruiters/${id}/score`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { recruiter: RecruiterPublic };
  return body.recruiter;
}

export async function generateOutreachMessage(
  id: string,
  provider?: TextProviderName,
): Promise<OutreachMessage> {
  const response = await fetch(`/api/career/recruiters/${id}/outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { message: OutreachMessage };
  return body.message;
}

export async function deleteRecruiter(id: string): Promise<RecruiterPublic[]> {
  const response = await fetch(`/api/career/recruiters/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { recruiters: RecruiterPublic[] };
  return body.recruiters;
}

export async function deleteJob(id: string): Promise<JobPublic[]> {
  const response = await fetch(`/api/career/jobs/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { jobs: JobPublic[] };
  return body.jobs;
}

export type JobFeedFilters = {
  eligibility: FeedEligibilityFilter[];
  minScore: number;
  source: string;
  q: string;
  postedWithinDays: number | null;
};

export async function fetchJobFeed(filters: JobFeedFilters): Promise<JobFeedItem[]> {
  const params = new URLSearchParams({
    eligibility: filters.eligibility.join(","),
    minScore: String(filters.minScore),
  });
  if (filters.source) params.set("source", filters.source);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.postedWithinDays) params.set("postedWithinDays", String(filters.postedWithinDays));
  const response = await fetch(`/api/career/feed?${params.toString()}`);
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { items: JobFeedItem[] };
  return body.items;
}

export async function evaluateJob(id: string): Promise<JobEvaluationPublic> {
  const response = await fetch(`/api/career/jobs/${id}/evaluate`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { evaluation: JobEvaluationPublic };
  return body.evaluation;
}

export async function runDiscoveryNow(): Promise<Array<{ sourceId: string; status: "QUEUED" | "ALREADY_RAN_TODAY" }>> {
  const response = await fetch("/api/career/discovery/run", { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as {
    results: Array<{ sourceId: string; status: "QUEUED" | "ALREADY_RAN_TODAY" }>;
  };
  return body.results;
}

export async function submitJobFeedback(jobId: string, input: JobFeedbackInput): Promise<JobFeedbackPublic> {
  const response = await fetch(`/api/career/jobs/${jobId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { feedback: JobFeedbackPublic };
  return body.feedback;
}

export async function fetchFeedbackSummary(): Promise<FeedbackSummary> {
  const response = await fetch("/api/career/feedback/summary");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { summary: FeedbackSummary };
  return body.summary;
}


// Applications (Milestone 3): prepared in a private browser, never submitted.
export async function fetchApplication(jobId: string): Promise<ApplicationPublic | null> {
  const response = await fetch(`/api/career/jobs/${jobId}/application`);
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { application: ApplicationPublic | null }).application;
}

export async function prepareApplication(jobId: string): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/jobs/${jobId}/application/prepare`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export async function saveApplicationAnswers(applicationId: string, input: ApplicationAnswersInput): Promise<void> {
  const response = await fetch(`/api/career/applications/${applicationId}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
}

export async function rejectApplication(applicationId: string): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/applications/${applicationId}/reject`, { method: "POST" });
  if (!response.ok) {
    throw await parseError(response);
  }
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export async function approveApplication(application: Pick<ApplicationPublic, "id" | "payloadHash">): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/applications/${application.id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payloadHash: application.payloadHash }),
  });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export async function withdrawApproval(applicationId: string): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/applications/${applicationId}/approval/withdraw`, { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export function applicationPreviewUrl(application: Pick<ApplicationPublic, "id" | "preview">): string {
  return `/api/career/applications/${application.id}/preview.png?at=${encodeURIComponent(application.preview?.capturedAt ?? "")}`;
}

export type AuthSession = { required: boolean; signedIn: boolean; expiresAt: string | null };

export async function fetchAuthSession(): Promise<AuthSession> {
  const response = await fetch("/api/auth/session");
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AuthSession;
}

export async function signIn(password: string): Promise<AuthSession> {
  const response = await fetch("/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AuthSession;
}

export async function signOut(): Promise<AuthSession> {
  const response = await fetch("/api/auth/sign-out", { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AuthSession;
}

export async function fetchApplicationInbox(): Promise<ApplicationInbox> {
  const response = await fetch("/api/career/applications");
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as ApplicationInbox;
}

// Queues the submission of an approved application again (when the first queueing failed).
export async function submitApplication(applicationId: string): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/applications/${applicationId}/submit`, { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export async function markApplicationSubmitted(applicationId: string): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/applications/${applicationId}/mark-submitted`, { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export async function markApplicationNotSent(applicationId: string): Promise<ApplicationPublic> {
  const response = await fetch(`/api/career/applications/${applicationId}/mark-not-sent`, { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { application: ApplicationPublic }).application;
}

export async function fetchSources(): Promise<SourcePublic[]> {
  const response = await fetch("/api/career/sources");
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { sources: SourcePublic[] }).sources;
}

export async function setSourceApplicationMode(sourceId: string, applicationMode: SourceApplicationMode): Promise<SourcePublic> {
  const response = await fetch(`/api/career/sources/${sourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationMode }),
  });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { source: SourcePublic }).source;
}

export type EmailAccountStatus = {
  configured: boolean;
  account: { provider: string; emailAddress: string; connectedAt: string; lastCheckedAt: string | null; lastError: string } | null;
};

export async function fetchEmailAccount(): Promise<EmailAccountStatus> {
  const response = await fetch("/api/email/account");
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as EmailAccountStatus;
}

// Returns Google's consent URL; the caller sends the browser there.
export async function startGmailConnect(): Promise<string> {
  const response = await fetch("/api/email/google/start", { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return ((await response.json()) as { url: string }).url;
}

export async function checkEmailNow(): Promise<void> {
  const response = await fetch("/api/email/check", { method: "POST" });
  if (!response.ok) throw await parseError(response);
}

export async function disconnectEmail(): Promise<EmailAccountStatus> {
  const response = await fetch("/api/email/disconnect", { method: "POST" });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as EmailAccountStatus;
}
