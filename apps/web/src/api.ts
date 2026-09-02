import type {
  AngleType,
  CompanyInput,
  CompanyPublic,
  ContentPlanStatus,
  ContentPlanTopic,
  ContentPlanTopicPublic,
  CustomTopicInput,
  CustomTopicPublic,
  ExperienceInput,
  ImageProviderName,
  ImagePublic,
  JobFitResult,
  JobInput,
  JobPatchInput,
  JobPublic,
  JobStatus,
  OpportunitySetPublic,
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

export async function fetchCompanies(): Promise<CompanyPublic[]> {
  const response = await fetch("/api/career/companies");
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { companies: CompanyPublic[] };
  return body.companies;
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

export async function deleteJob(id: string): Promise<JobPublic[]> {
  const response = await fetch(`/api/career/jobs/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw await parseError(response);
  }
  const body = (await response.json()) as { jobs: JobPublic[] };
  return body.jobs;
}
