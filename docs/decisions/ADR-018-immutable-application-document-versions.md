# ADR-018 — Generated application documents are immutable versions

## Status

Accepted

## Context

Milestone 2 generates per-job application materials: a tailored CV, an optional cover
letter and answers to common application questions. Until now résumé tailoring stored
nothing. The client held the tailoring plan and sent it back to export a PDF, so there was no
record of what the user actually sent where.

The spec asks for a `Document` entity (id, profileVersion, jobId, type, fileHash,
storageReference). Milestone 4 approval binds one exact CV version and answer payload to an
application, and any change after approval must invalidate it. Contact details now exist
(application details, migration 0025) and end up inside the CV PDF.

## Options considered

1. **Keep documents ephemeral.** Regenerate on every download, as tailoring does today. No
   storage and no history. Approval in Milestone 4 would have nothing stable to point at,
   and a regenerated CV can differ from the one the user reviewed.
2. **One mutable document per job and type.** Simple to read, but an edit overwrites what an
   approval or a past application referred to.
3. **Immutable versions per job and type.** Every change is a new row, recorded with the
   profile and application-details versions it was built from, a content hash and the file's
   hash. Saving identical content returns the latest version instead of adding one.

## Decision

Option 3. `application_documents` (migration 0026) is insert-only, unique on (job, type,
version). `ApplicationDocumentService.save` hashes the content with key order normalized
(`document-versioning.ts`) and adds a version only when the hash differs from the latest one.
A rendered PDF goes to the existing `StorageProvider`, and its sha256 is stored as `fileHash`.
A user's edit to a generated document is saved as a new version with origin `EDITED`.

## Consequences

- Milestone 4 can bind an approval to a document id and its hashes. A later version never
  changes what was approved.
- History grows with each change. Versions are small JSON plus one PDF each, and the content
  hash skips duplicates.
- Deleting a job deletes its document rows (`ON DELETE CASCADE`). The job-delete route also
  removes the stored files first, because CV PDFs carry contact details.
- Documents record `profileVersion` and `detailsVersion`, so the UI can show when a document
  was built from an older profile.

## Tradeoffs

Option 1 had no storage cost and no deletion concerns, but it cannot support approval or
auditing. Option 2 is simpler to query but loses the exact artifact the user reviewed. Option
3 costs a version table and file cleanup on job deletion, and keeps every past version until
the job is deleted. A retention limit can be added later without changing the model.
