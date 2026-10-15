import type { ApplicationMode, SourceApplicationMode, SupportedApplicationPortal } from "@studio/shared";

// Whether the app may submit an approved application itself (Milestone 4, spec section 6
// "Application policies"). Three things must agree: the deployment's switch
// (APPLICATION_SUBMISSION_ENABLED, off by default), the application being on a supported
// portal, and that portal's row in the source registry set to AUTOMATED by the user.
// Anything else uses the assisted path: the user submits by hand.

export type PermissionInput = {
  switchOn: boolean;
  mode: ApplicationMode;
  portal: SupportedApplicationPortal | null;
  source: { enabled: boolean; applicationMode: SourceApplicationMode } | null;
};

export type SubmissionBlock = "MANUAL_APPLICATION" | "SWITCHED_OFF" | "SOURCE_DISABLED" | "PORTAL_NOT_AUTOMATED";

export type SubmissionPermission = { allowed: true } | { allowed: false; reason: SubmissionBlock };

export function submissionPermission(input: PermissionInput): SubmissionPermission {
  if (input.mode !== "AUTOMATED" || input.portal === null) return { allowed: false, reason: "MANUAL_APPLICATION" };
  if (!input.switchOn) return { allowed: false, reason: "SWITCHED_OFF" };
  if (input.source && !input.source.enabled) return { allowed: false, reason: "SOURCE_DISABLED" };
  if (input.source?.applicationMode !== "AUTOMATED") return { allowed: false, reason: "PORTAL_NOT_AUTOMATED" };
  return { allowed: true };
}

export const SUBMISSION_BLOCK_TEXT: Record<SubmissionBlock, string> = {
  MANUAL_APPLICATION: "This portal is not automated. Submit the application yourself.",
  SWITCHED_OFF: "Automatic submission is switched off (APPLICATION_SUBMISSION_ENABLED). Submit the application yourself.",
  SOURCE_DISABLED: "This portal is turned off in source settings. Submit the application yourself.",
  PORTAL_NOT_AUTOMATED: "Automatic submission is not turned on for this portal. Submit the application yourself.",
};

export type PolicyLookup = (portal: SupportedApplicationPortal) => Promise<PermissionInput["source"]>;

// The permission for one application, reading its portal's row from the source registry.
export function submissionCheckFor(switchOn: boolean, lookup: PolicyLookup) {
  return async (application: { mode: string; portal: string | null }): Promise<SubmissionPermission> => {
    const portal = application.portal as SupportedApplicationPortal | null;
    return submissionPermission({
      switchOn,
      mode: application.mode as ApplicationMode,
      portal,
      source: portal ? await lookup(portal) : null,
    });
  };
}
