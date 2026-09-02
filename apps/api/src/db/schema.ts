import {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
