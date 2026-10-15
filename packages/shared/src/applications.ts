import { z } from "zod";

// Job Hunter (spec section 4): the application for one job, from preparation (Milestone 3)
// to approval and submission (Milestone 4). EXPIRED means the posting no longer takes
// applications.
export const APPLICATION_STATES = [
  "PREPARING",
  "NEEDS_INFORMATION",
  "READY_FOR_REVIEW",
  "BLOCKED_BY_PLATFORM",
  "FAILED",
  "USER_REJECTED",
  "APPROVED",
  "SUBMITTING",
  "SUBMITTED",
  "SUBMISSION_UNKNOWN",
  "EXPIRED",
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

// The live approval of an application (Milestone 4): bound to one payload hash and destination,
// and valid until it expires or a change invalidates it.
export const approvalPublicSchema = z.object({
  id: z.string().uuid(),
  payloadHash: z.string(),
  destinationUrl: z.string(),
  decidedAt: z.string(),
  expiresAt: z.string(),
});
export type ApprovalPublic = z.infer<typeof approvalPublicSchema>;

// The user approves the payload hash they were shown, so a change in between is caught.
export const approveApplicationInputSchema = z.object({
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ApproveApplicationInput = z.infer<typeof approveApplicationInputSchema>;

// One submission run (Milestone 4): when it started, whether and when the submit button was
// clicked, and how it ended.
export const executionPublicSchema = z.object({
  id: z.string().uuid(),
  attemptNumber: z.number().int(),
  startedAt: z.string(),
  clickedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  // The application state the run ended in, or "" while it runs.
  result: z.string(),
  errorType: z.string(),
  // The HTTP status of the submit request, if one was sent and answered.
  submitStatus: z.number().int().nullable(),
  confirmationReference: z.string(),
});
export type ExecutionPublic = z.infer<typeof executionPublicSchema>;

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
  approval: approvalPublicSchema.nullable(),
  // Whether the app would submit this application itself once approved, and if not, why.
  submission: z.object({ allowed: z.boolean(), reason: z.string() }),
  submittedAt: z.string().nullable(),
  // The portal's own reference for the submitted application, when it showed one.
  confirmationReference: z.string(),
  executions: z.array(executionPublicSchema),
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

// The approval inbox (Milestone 4): applications that wait on you or are being submitted.
export const INBOX_STATES = [
  "READY_FOR_REVIEW",
  "NEEDS_INFORMATION",
  "APPROVED",
  "SUBMITTING",
  "SUBMISSION_UNKNOWN",
  "BLOCKED_BY_PLATFORM",
] as const satisfies readonly ApplicationState[];

export const applicationInboxItemSchema = z.object({
  application: applicationPublicSchema,
  job: z.object({ id: z.string().uuid(), title: z.string(), company: z.string() }),
});
export type ApplicationInboxItem = z.infer<typeof applicationInboxItemSchema>;

export const applicationInboxSchema = z.object({
  items: z.array(applicationInboxItemSchema),
  // APPLICATION_SUBMISSION_ENABLED for this deployment.
  submissionEnabled: z.boolean(),
});
export type ApplicationInbox = z.infer<typeof applicationInboxSchema>;

// A reply about an application (Milestone 5): read from Gmail or pasted by the user. Its text is
// the sender's, kept as data.
export const RECRUITER_MESSAGE_SOURCES = ["GMAIL", "PASTED"] as const;

// What a recruiter message says (Milestone 5, ticket 4). UNCLEAR when nothing in the message
// proves a class.
export const RECRUITER_MESSAGE_CLASSES = [
  "APPLICATION_RECEIVED",
  "REJECTION",
  "INTERVIEW_REQUEST",
  "ASSESSMENT",
  "OFFER",
  "RECRUITER_OUTREACH",
  "OTHER",
  "UNCLEAR",
] as const;
export type RecruiterMessageClass = (typeof RECRUITER_MESSAGE_CLASSES)[number];

// The model's answer for recruiter-message.v1: one class and the quote it rests on.
export const recruiterMessageClassificationSchema = z.object({
  classification: z.enum(RECRUITER_MESSAGE_CLASSES),
  evidence: z.string().max(600),
});
export const recruiterMessagePublicSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(RECRUITER_MESSAGE_SOURCES),
  senderDomain: z.string(),
  subject: z.string(),
  // Null once removed after 180 days.
  body: z.string().nullable(),
  receivedAt: z.string().nullable(),
  matchConfidence: z.string(),
  matchReason: z.string(),
  // "" until classified, then one of RECRUITER_MESSAGE_CLASSES.
  classification: z.string(),
  evidence: z.string(),
  // RULES, the prompt version (recruiter-message.v1), or NONE.
  classifiedBy: z.string(),
  suggestedStatus: z.string(),
  decision: z.string(),
});
export type RecruiterMessagePublic = z.infer<typeof recruiterMessagePublicSchema>;

// A sent application and what came back (Milestone 5, ticket 5).
export const MESSAGE_DECISIONS = ["ACCEPTED", "DISMISSED"] as const;
export const sentApplicationSchema = z.object({
  applicationId: z.string().uuid(),
  applicationStatus: z.string(),
  submittedAt: z.string(),
  job: z.object({ id: z.string().uuid(), title: z.string(), company: z.string(), status: z.string() }),
  messages: z.array(recruiterMessagePublicSchema),
  // "Consider following up": no reply after the configured days, the job still at APPLIED.
  followUp: z.object({ due: z.boolean(), waitingDays: z.number().int() }),
});
export type SentApplication = z.infer<typeof sentApplicationSchema>;

export const pastedMessageInputSchema = z.object({
  subject: z.string().trim().max(500).default(""),
  body: z.string().trim().min(1).max(20_000),
  from: z.string().trim().max(320).default(""),
  receivedAt: z.string().datetime().optional(),
});
export type PastedMessageInput = z.infer<typeof pastedMessageInputSchema>;
