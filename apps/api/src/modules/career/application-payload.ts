import type { FieldPlan, SupportedApplicationPortal } from "@studio/shared";
import { documentContentHash } from "./document-versioning.js";

// The application payload's identity (spec section 4, Milestone 4's approval binds to it).
// It covers the job, the destination, the form's shape (its questions, kinds and which are
// required, so a revised form is a new payload), every field's value and, for attachments,
// the exact document version and file bytes. Per-run field keys, labels' casing, notes and
// sources are not material, so they are left out, and field order does not matter.

export type PayloadInput = {
  jobId: string;
  destinationUrl: string;
  portal: SupportedApplicationPortal | null;
  plan: FieldPlan[];
  // File hash of each attachable document, by document id.
  fileHashes: Record<string, string | null>;
};

function destination(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function applicationPayloadHash(input: PayloadInput): string {
  const fields = input.plan
    .map((field) => ({
      question: field.questionKey,
      kind: field.kind,
      required: field.required,
      options: [...field.options].sort(),
      status: field.status,
      value: field.status === "FILLED" ? field.value : null,
      document: field.status === "FILLED" && field.documentId ? field.documentId : null,
      fileHash: field.status === "FILLED" && field.documentId ? (input.fileHashes[field.documentId] ?? null) : null,
    }))
    .sort((a, b) => {
      const left = JSON.stringify([a.question, a.kind, a.value, a.document]);
      const right = JSON.stringify([b.question, b.kind, b.value, b.document]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return documentContentHash({
    format: "application-payload@1",
    jobId: input.jobId,
    destination: destination(input.destinationUrl),
    portal: input.portal,
    fields,
  });
}
