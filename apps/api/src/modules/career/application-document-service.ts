import { createHash } from "node:crypto";
import type { ApplicationDocumentOrigin, ApplicationDocumentPublic, ApplicationDocumentType } from "@studio/shared";
import { notFound } from "../../app-error.js";
import type { StorageProvider } from "../uploads/storage-provider.js";
import type { ApplicationDocumentRepository, ApplicationDocumentRow } from "./application-document-repository.js";
import { documentContentHash, nextDocumentVersion } from "./document-versioning.js";

export type SaveDocumentInput = {
  jobId: string;
  type: ApplicationDocumentType;
  origin: ApplicationDocumentOrigin;
  profileVersion: number;
  detailsVersion: number | null;
  content: Record<string, unknown>;
  // The rendered file (a PDF), when the document has one.
  file?: { bytes: Buffer; mimeType: "application/pdf" };
};

// Generated application documents (Milestone 2): immutable versions per job and type. Saving
// the same content again returns the latest version instead of adding one (ADR-018).
export class ApplicationDocumentService {
  constructor(
    private readonly repo: Pick<ApplicationDocumentRepository, "latest" | "insert" | "listForJob" | "get">,
    private readonly storage: Pick<StorageProvider, "put" | "get" | "delete">,
    private readonly jobExists: (jobId: string) => Promise<boolean>,
  ) {}

  async save(input: SaveDocumentInput): Promise<{ document: ApplicationDocumentPublic; created: boolean }> {
    const contentHash = documentContentHash(input.content);
    const latest = await this.repo.latest(input.jobId, input.type);
    const next = nextDocumentVersion(latest, contentHash);
    if (next.action === "UNCHANGED" && latest) {
      return { document: documentToPublic(latest), created: false };
    }

    let storageKey: string | null = null;
    let fileHash: string | null = null;
    if (input.file) {
      storageKey = (await this.storage.put({ bytes: input.file.bytes, mimeType: input.file.mimeType, extension: "pdf" })).key;
      fileHash = createHash("sha256").update(input.file.bytes).digest("hex");
    }
    try {
      const row = await this.repo.insert({
        jobId: input.jobId,
        type: input.type,
        version: next.version,
        origin: input.origin,
        profileVersion: input.profileVersion,
        detailsVersion: input.detailsVersion,
        content: input.content,
        contentHash,
        storageKey,
        fileHash,
      });
      return { document: documentToPublic(row), created: true };
    } catch (error) {
      // Do not leave an orphaned file behind a failed insert (e.g. a concurrent save took the version).
      if (storageKey) await this.storage.delete(storageKey);
      throw error;
    }
  }

  async list(jobId: string): Promise<ApplicationDocumentPublic[]> {
    if (!(await this.jobExists(jobId))) {
      throw notFound("Job not found.");
    }
    return (await this.repo.listForJob(jobId)).map(documentToPublic);
  }

  async getFile(id: string): Promise<{ bytes: Buffer; mimeType: string; filename: string }> {
    const row = await this.repo.get(id);
    const object = row?.storageKey ? await this.storage.get(row.storageKey) : null;
    if (!row || !object) {
      throw notFound("Document file not found.");
    }
    return {
      bytes: object.bytes,
      mimeType: object.mimeType,
      filename: `${row.type.toLowerCase().replace(/_/g, "-")}-v${row.version}.pdf`,
    };
  }

  // Rows go with the job (ON DELETE CASCADE); their files are removed here first.
  async deleteFilesForJob(jobId: string): Promise<void> {
    for (const row of await this.repo.listForJob(jobId)) {
      if (row.storageKey) await this.storage.delete(row.storageKey);
    }
  }
}

export function documentToPublic(row: ApplicationDocumentRow): ApplicationDocumentPublic {
  return {
    id: row.id,
    jobId: row.jobId,
    type: row.type as ApplicationDocumentType,
    version: row.version,
    origin: row.origin as ApplicationDocumentOrigin,
    profileVersion: row.profileVersion,
    detailsVersion: row.detailsVersion,
    content: row.content,
    contentHash: row.contentHash,
    hasFile: row.storageKey !== null,
    fileHash: row.fileHash,
    createdAt: row.createdAt.toISOString(),
  };
}
