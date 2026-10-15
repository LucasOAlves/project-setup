import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ContentPlanTopic,
  FactReview,
  ImageBriefPayload,
  OpportunityPayload,
  PersonaPayload,
  QualityScore,
  SeoReview,
  StoryStrategy,
  WritingReview,
} from "@studio/shared";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  headline: text("headline").notNull().default(""),
  currentJobTitle: text("current_job_title").notNull().default(""),
  currentCompany: text("current_company").notNull().default(""),
  about: text("about").notNull().default(""),
  topSkills: jsonb("top_skills").$type<string[]>().notNull().default([]),
  technologies: jsonb("technologies").$type<string[]>().notNull().default([]),
  industries: jsonb("industries").$type<string[]>().notNull().default([]),
  yearsOfExperience: integer("years_of_experience"),
  architectureExperience: text("architecture_experience").notNull().default(""),
  leadershipExperience: text("leadership_experience").notNull().default(""),
  businessImpact: text("business_impact").notNull().default(""),
  subjectsOfInterest: jsonb("subjects_of_interest").$type<string[]>().notNull().default([]),
  subjectsToAvoid: jsonb("subjects_to_avoid").$type<string[]>().notNull().default([]),
  targetAudience: text("target_audience").notNull().default(""),
  preferredLanguage: text("preferred_language").notNull().default("English"),
  positioning: jsonb("positioning").$type<string[]>().notNull().default([]),
  desiredPerception: text("desired_perception").notNull().default(""),
  writingTones: jsonb("writing_tones").$type<string[]>().notNull().default([]),
  postLength: text("post_length").notNull().default("MEDIUM"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const professionalExperiences = pgTable("professional_experiences", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role").notNull().default(""),
  company: text("company").notNull().default(""),
  startPeriod: text("start_period").notNull().default(""),
  endPeriod: text("end_period").notNull().default(""),
  description: text("description").notNull().default(""),
  responsibilities: text("responsibilities").notNull().default(""),
  achievements: text("achievements").notNull().default(""),
  technologies: jsonb("technologies").$type<string[]>().notNull().default([]),
  measurableOutcomes: text("measurable_outcomes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const writingSamples = pgTable("writing_samples", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const uploadedPhotos = pgTable("uploaded_photos", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const professionalPersonas = pgTable("professional_personas", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<PersonaPayload>().notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const researchRuns = pgTable("research_runs", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  personaId: uuid("persona_id")
    .notNull()
    .references(() => professionalPersonas.id, { onDelete: "cascade" }),
  queryTopics: jsonb("query_topics").$type<string[]>().notNull(),
  source: text("source").notNull().default("discover"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const newsArticles = pgTable("news_articles", {
  id: uuid("id").primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => researchRuns.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  source: text("source").notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  provider: text("provider").notNull(),
  providerArticleId: text("provider_article_id").notNull(),
});

export const opportunitySets = pgTable("opportunity_sets", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  researchRunId: uuid("research_run_id")
    .notNull()
    .references(() => researchRuns.id, { onDelete: "cascade" }),
  personaId: uuid("persona_id")
    .notNull()
    .references(() => professionalPersonas.id, { onDelete: "cascade" }),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  selectedOpportunityId: uuid("selected_opportunity_id"),
  selectedAt: timestamp("selected_at", { withTimezone: true }),
  source: text("source").notNull().default("discover"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentOpportunities = pgTable("content_opportunities", {
  id: uuid("id").primaryKey(),
  setId: uuid("set_id")
    .notNull()
    .references(() => opportunitySets.id, { onDelete: "cascade" }),
  articleId: uuid("article_id")
    .notNull()
    .references(() => newsArticles.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<OpportunityPayload>().notNull(),
  matchScore: integer("match_score").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const contentPlanTopics = pgTable("content_plan_topics", {
  id: uuid("id").primaryKey(),
  topicId: text("topic_id").notNull().unique(),
  status: text("status").notNull().default("PLANNED"),
  contentOpportunityId: uuid("content_opportunity_id").references(
    () => contentOpportunities.id,
    { onDelete: "set null" },
  ),
  generatedPostId: uuid("generated_post_id").references(() => generatedPosts.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  industry: text("industry").notNull().default(""),
  size: text("size").notNull().default(""),
  locations: jsonb("locations").$type<string[]>().notNull().default([]),
  careerPageUrl: text("career_page_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Target-company watchlist (Milestone 1.5): the ATS board polled daily for one company.
export const companyWatches = pgTable("company_watches", {
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  boardToken: text("board_token").notNull(),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastStatus: text("last_status").notNull().default("NEVER"),
  lastError: text("last_error").notNull().default(""),
  openPostings: integer("open_postings"),
  recentPostings: integer("recent_postings"),
  newPostings: integer("new_postings"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Talent-platform checklist (Milestone 1.5): the user's status on each platform in the catalog.
export const talentPlatformProfiles = pgTable("talent_platform_profiles", {
  siteId: text("site_id").primaryKey(),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applicationDetails = pgTable("application_details", {
  id: uuid("id").primaryKey(),
  contact: jsonb("contact").$type<Record<string, string>>().notNull().default({}),
  education: jsonb("education").$type<unknown[]>().notNull().default([]),
  certifications: jsonb("certifications").$type<unknown[]>().notNull().default([]),
  spokenLanguages: jsonb("spoken_languages").$type<unknown[]>().notNull().default([]),
  workAuthorization: text("work_authorization").notNull().default(""),
  requiresVisaSponsorship: boolean("requires_visa_sponsorship"),
  noticePeriod: text("notice_period").notNull().default(""),
  timeZone: text("time_zone").notNull().default(""),
  salaryExpectation: jsonb("salary_expectation").$type<Record<string, unknown> | null>(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("manual"),
  externalId: text("external_id").notNull().default(""),
  url: text("url").notNull().default(""),
  title: text("title").notNull(),
  location: text("location").notNull().default(""),
  workplaceType: text("workplace_type"),
  employmentType: text("employment_type"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency").notNull().default(""),
  description: text("description").notNull().default(""),
  requirements: jsonb("requirements").$type<string[]>().notNull().default([]),
  preferredQualifications: jsonb("preferred_qualifications").$type<string[]>().notNull().default([]),
  technologies: jsonb("technologies").$type<string[]>().notNull().default([]),
  seniority: text("seniority").notNull().default(""),
  status: text("status").notNull().default("SAVED"),
  fitScore: integer("fit_score"),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
  canonicalUrl: text("canonical_url").notNull().default(""),
  rawDescription: text("raw_description").notNull().default(""),
  contentHash: text("content_hash").notNull().default(""),
  sourcePostedAt: timestamp("source_posted_at", { withTimezone: true }),
  normalizedData: jsonb("normalized_data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// UNIQUE (job_id, type, version) is in migration 0026.
export const applicationDocuments = pgTable("application_documents", {
  id: uuid("id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  version: integer("version").notNull(),
  origin: text("origin").notNull(),
  profileVersion: integer("profile_version").notNull(),
  detailsVersion: integer("details_version"),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  contentHash: text("content_hash").notNull(),
  storageKey: text("storage_key"),
  fileHash: text("file_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// UNIQUE (job_id) is in migration 0027: one application per job.
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  portal: text("portal"),
  destinationUrl: text("destination_url").notNull().default(""),
  lastError: text("last_error").notNull().default(""),
  formSnapshot: jsonb("form_snapshot").$type<Record<string, unknown>>(),
  fieldPlan: jsonb("field_plan").$type<unknown[]>(),
  preview: jsonb("preview").$type<Record<string, unknown>>(),
  payloadHash: text("payload_hash"),
  agreed: jsonb("agreed").$type<string[]>().notNull().default([]),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmationReference: text("confirmation_reference").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  payloadHash: text("payload_hash").notNull(),
  destinationUrl: text("destination_url").notNull(),
  documentIds: jsonb("document_ids").$type<string[]>().notNull().default([]),
  formRevision: text("form_revision").notNull().default(""),
  decision: text("decision").notNull().default("APPROVED"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  invalidationReason: text("invalidation_reason").notNull().default(""),
});

export const executions = pgTable("executions", {
  id: uuid("id").primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  approvalId: uuid("approval_id")
    .notNull()
    .references(() => approvals.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  result: text("result").notNull().default(""),
  errorType: text("error_type").notNull().default(""),
  submitStatus: integer("submit_status"),
  confirmationReference: text("confirmation_reference").notNull().default(""),
});

export const savedFormAnswers = pgTable("saved_form_answers", {
  questionKey: text("question_key").primaryKey(),
  label: text("label").notNull(),
  answer: text("answer").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recruiters = pgTable("recruiters", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  relatedJobId: uuid("related_job_id").references(() => jobs.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  connectionStatus: text("connection_status").notNull().default("NOT_CONNECTED"),
  relevanceScore: integer("relevance_score"),
  notes: text("notes").notNull().default(""),
  nextAction: text("next_action").notNull().default(""),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobStatusEvents = pgTable("job_status_events", {
  id: uuid("id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentPlanUploads = pgTable("content_plan_uploads", {
  id: uuid("id").primaryKey(),
  sourceFilename: text("source_filename").notNull(),
  topics: jsonb("topics").$type<ContentPlanTopic[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generatedPosts = pgTable("generated_posts", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => contentOpportunities.id, { onDelete: "cascade" }),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  tone: text("tone").notNull(),
  angle: text("angle").notNull(),
  hook: text("hook").notNull(),
  body: text("body").notNull(),
  storyStrategy: jsonb("story_strategy").$type<StoryStrategy>().notNull(),
  writingReview: jsonb("writing_review").$type<WritingReview>().notNull(),
  factReview: jsonb("fact_review").$type<FactReview>().notNull(),
  seoReview: jsonb("seo_review").$type<SeoReview>().notNull(),
  quality: jsonb("quality").$type<QualityScore>().notNull(),
  status: text("status").notNull().default("DRAFT"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  outcome: text("outcome"),
  outcomeNotes: text("outcome_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generatedImages = pgTable("generated_images", {
  id: uuid("id").primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => generatedPosts.id, { onDelete: "cascade" }),
  briefPayload: jsonb("brief_payload").$type<ImageBriefPayload>().notNull(),
  prompt: text("prompt").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customTopics = pgTable("custom_topics", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  hook: text("hook").notNull(),
  objective: text("objective").notNull().default(""),
  keyPoints: jsonb("key_points").$type<string[]>().notNull().default([]),
  cta: text("cta").notNull().default(""),
  angle: text("angle").notNull().default("EDUCATIONAL"),
  pillar: text("pillar").notNull().default(""),
  sourceUrl: text("source_url"),
  status: text("status").notNull().default("PLANNED"),
  contentOpportunityId: uuid("content_opportunity_id").references(
    () => contentOpportunities.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  adapterType: text("adapter_type").notNull(),
  discoveryAllowed: boolean("discovery_allowed").notNull().default(true),
  applicationMode: text("application_mode").notNull().default("MANUAL"),
  termsUrl: text("terms_url").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobEvaluations = pgTable("job_evaluations", {
  id: uuid("id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  profileVersion: integer("profile_version").notNull(),
  eligibility: text("eligibility").notNull(),
  eligibilityReasons: jsonb("eligibility_reasons").$type<unknown[]>().notNull().default([]),
  score: integer("score"),
  scoreBreakdown: jsonb("score_breakdown").$type<Record<string, unknown>>().notNull().default({}),
  confidence: integer("confidence"),
  explanation: jsonb("explanation").$type<unknown>(),
  evidence: jsonb("evidence").$type<unknown[]>().notNull().default([]),
  modelVersion: text("model_version").notNull().default(""),
  promptVersion: text("prompt_version").notNull().default(""),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobFeedback = pgTable("job_feedback", {
  id: uuid("id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  evaluationId: uuid("evaluation_id")
    .notNull()
    .references(() => jobEvaluations.id, { onDelete: "cascade" }),
  verdict: text("verdict").notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  correlationId: text("correlation_id").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

// Milestone 5: the connected recruiter mailbox. The refresh token is sealed (secret-box.ts).
export const emailAccounts = pgTable("email_accounts", {
  id: uuid("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  emailAddress: text("email_address").notNull(),
  sealedRefreshToken: text("sealed_refresh_token").notNull(),
  scope: text("scope").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
});
