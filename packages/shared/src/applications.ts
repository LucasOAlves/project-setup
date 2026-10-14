import { z } from "zod";

// Job Hunter Milestone 3 (spec section 4): the application for one job, from preparation to
// review. APPROVED, SUBMITTING, SUBMITTED and SUBMISSION_UNKNOWN arrive with Milestone 4.
export const APPLICATION_STATES = [
  "PREPARING",
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
  "USER_REJECTED",
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export const APPLICATION_ACTORS = ["USER", "WORKER", "SYSTEM"] as const;
export type ApplicationActor = (typeof APPLICATION_ACTORS)[number];

// AUTOMATED: the browser worker fills the form. MANUAL: the portal is not supported, so the
// app shows the prepared answers and the link for the user to complete it themselves.
export const APPLICATION_MODES = ["AUTOMATED", "MANUAL"] as const;
export type ApplicationMode = (typeof APPLICATION_MODES)[number];

export const SUPPORTED_APPLICATION_PORTALS = ["greenhouse", "lever", "ashby"] as const;
export type SupportedApplicationPortal = (typeof SUPPORTED_APPLICATION_PORTALS)[number];

export const applicationEventPublicSchema = z.object({
  id: z.string().uuid(),
  fromStatus: z.enum(APPLICATION_STATES).nullable(),
  toStatus: z.enum(APPLICATION_STATES),
  actor: z.enum(APPLICATION_ACTORS),
  reason: z.string(),
  createdAt: z.string(),
});
export type ApplicationEventPublic = z.infer<typeof applicationEventPublicSchema>;



// A field read from a portal's application form (Milestone 3). Labels and options are the
// page's own text: data to show and match, never instructions.
export const FORM_FIELD_KINDS = [
  "TEXT",
  "EMAIL",
  "PHONE",
  "URL",
  "NUMBER",
  "DATE",
  "TEXTAREA",
  "SELECT",
  "COMBOBOX",
  "RADIO",
  "CHECKBOX",
  "YES_NO",
  "FILE",
] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export const formFieldSchema = z.object({
  // Stable within one run: the reader tags each control with it.
  key: z.string(),
  label: z.string(),
  kind: z.enum(FORM_FIELD_KINDS),
  required: z.boolean(),
  options: z.array(z.string()),
  // The control's own name or id, which often says more than the label (e.g. "urls[LinkedIn]").
  name: z.string(),
  accept: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSnapshotSchema = z.object({
  portal: z.enum(SUPPORTED_APPLICATION_PORTALS),
  url: z.string(),
  title: z.string(),
  fields: z.array(formFieldSchema),
  readAt: z.string(),
});
export type FormSnapshot = z.infer<typeof formSnapshotSchema>;



// What the filler will put in each form field, and where it came from (Milestone 3).
export const FIELD_PLAN_STATUSES = ["FILLED", "NEEDS_INPUT", "LEFT_EMPTY"] as const;
export type FieldPlanStatus = (typeof FIELD_PLAN_STATUSES)[number];

export const FIELD_PLAN_SOURCES = [
  "YOUR_DETAILS",
  "YOUR_PROFILE",
  "PREPARED_ANSWER",
  "SAVED_ANSWER",
  "CV",
  "COVER_LETTER",
] as const;
export type FieldPlanSource = (typeof FIELD_PLAN_SOURCES)[number];

export const fieldPlanSchema = z.object({
  key: z.string(),
  // The question as the portal words it, normalized: answers you give are saved under it
  // and reused on any form that asks the same thing.
  questionKey: z.string(),
  label: z.string(),
  kind: z.enum(FORM_FIELD_KINDS),
  required: z.boolean(),
  options: z.array(z.string()),
  status: z.enum(FIELD_PLAN_STATUSES),
  value: z.string().nullable(),
  // For FILE fields: the application document to attach.
  documentId: z.string().uuid().optional(),
  source: z.enum(FIELD_PLAN_SOURCES).nullable(),
  note: z.string().optional(),
});
export type FieldPlan = z.infer<typeof fieldPlanSchema>;

export const applicationPreviewSchema = z.object({
  capturedAt: z.string(),
  // Removed after 30 days. The counts stay.
  hasScreenshot: z.boolean(),
  pageUrl: z.string(),
  // Fields the page showed back exactly as planned.
  confirmed: z.number().int(),
  // Fields filled but that the page cannot report back (some Yes/No buttons).
  unverified: z.array(z.string()),
  // Requests the network guard refused during the run.
  blockedRequests: z.number().int(),
});
export type ApplicationPreview = z.infer<typeof applicationPreviewSchema>;

export const applicationPublicSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  status: z.enum(APPLICATION_STATES),
  mode: z.enum(APPLICATION_MODES),
  portal: z.enum(SUPPORTED_APPLICATION_PORTALS).nullable(),
  destinationUrl: z.string(),
  lastError: z.string(),
  // The form read on the last browser run, if any.
  form: formSnapshotSchema.nullable(),
  // What goes in each field of that form, and which questions still need your answer.
  plan: z.array(fieldPlanSchema).nullable(),
  preview: applicationPreviewSchema.nullable(),
  // Identifies the exact payload (destination, form, values, attachments). Milestone 4's
  // approval is bound to it.
  payloadHash: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(applicationEventPublicSchema),
});
export type ApplicationPublic = z.infer<typeof applicationPublicSchema>;

// Answers to an application's open questions (Milestone 3). Answers are saved by question and
// reused on any form asking the same; consent boxes apply to this application only.
export const applicationAnswersInputSchema = z.object({
  answers: z
    .array(z.object({ questionKey: z.string().min(1).max(400), answer: z.string().trim().min(1).max(3000) }))
    .max(60)
    .default([]),
  agreed: z.array(z.string().min(1).max(400)).max(20).default([]),
});
export type ApplicationAnswersInput = z.infer<typeof applicationAnswersInputSchema>;
