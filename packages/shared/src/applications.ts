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
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(applicationEventPublicSchema),
});
export type ApplicationPublic = z.infer<typeof applicationPublicSchema>;
