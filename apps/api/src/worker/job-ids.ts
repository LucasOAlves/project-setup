// Deterministic BullMQ job ids (spec §2 "idempotent handlers"). BullMQ ignores an add() whose
// jobId already exists in the queue, so enqueueing the same discovery run or the same
// evaluation twice is a no-op instead of a duplicate run. BullMQ rejects ids with ":".

function safe(part: string): string {
  return part.replaceAll(":", "_");
}

// One discovery run per source per UTC day: a retried scheduler tick or a manual
// "run now" on the same day reuses the id.
export function discoveryJobId(sourceId: string, at: Date): string {
  return `discovery.${safe(sourceId)}.${at.toISOString().slice(0, 10)}`;
}

// One evaluation per job per profile version: saving the profile (which bumps its version)
// is what makes a re-evaluation a new job.
export function evaluationJobId(jobId: string, profileVersion: number): string {
  return `evaluation.${safe(jobId)}.v${profileVersion}`;
}

// One watchlist poll per company per UTC hour, the same courtesy limit isPollDue enforces:
// "Check now" pressed twice, or a retried daily tick, adds nothing within the hour.
export function watchJobId(companyId: string, at: Date): string {
  return `watch.${safe(companyId)}.${at.toISOString().slice(0, 13)}`;
}
