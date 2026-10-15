// Backup file names and which old backups to delete (Milestone 6, JOB-031). Pure.
//
// Names sort by time: jobhunter-2026-10-15T03-00-00Z.jhb (sealed) or .json (a plain export,
// which is never pruned because the user made it on purpose).

const SEALED = /^jobhunter-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.jhb$/;

export function backupFileName(now: Date, plain: boolean): string {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `jobhunter-${stamp}.${plain ? "json" : "jhb"}`;
}

export function backupsToPrune(names: string[], keep: number): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error("Keep at least 1 backup.");
  const sealed = names.filter((name) => SEALED.test(name)).sort().reverse();
  return sealed.slice(keep);
}
