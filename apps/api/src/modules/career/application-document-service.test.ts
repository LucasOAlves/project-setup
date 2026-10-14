import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../app-error.js";
import type { ApplicationDocumentRow, NewApplicationDocument } from "./application-document-repository.js";
import { ApplicationDocumentService } from "./application-document-service.js";

const JOB = "11111111-1111-4111-8111-111111111111";

function setup(options: { failInsert?: boolean } = {}) {
  const rows: ApplicationDocumentRow[] = [];
  const files = new Map<string, Buffer>();
  const repo = {
    async latest(jobId: string, type: string) {
      return rows.filter((row) => row.jobId === jobId && row.type === type).sort((a, b) => b.version - a.version)[0] ?? null;
    },
    async insert(input: NewApplicationDocument) {
      if (options.failInsert) throw new Error("duplicate key");
      const row = { id: `00000000-0000-4000-8000-00000000000${rows.length}`, createdAt: new Date("2026-10-14T12:00:00Z"), ...input };
      rows.push(row);
      return row;
    },
    async listForJob(jobId: string) {
      return rows.filter((row) => row.jobId === jobId);
    },
    async get(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
  };
  const storage = {
    async put(input: { bytes: Buffer }) {
      const key = `key-${files.size}.pdf`;
      files.set(key, input.bytes);
      return { key };
    },
    async get(key: string) {
      const bytes = files.get(key);
      return bytes ? { key, bytes, mimeType: "application/pdf" } : null;
    },
    async delete(key: string) {
      files.delete(key);
    },
  };
  const service = new ApplicationDocumentService(repo, storage, async (id) => id === JOB);
  return { service, rows, files };
}

const base = {
  jobId: JOB,
  type: "CV" as const,
  origin: "GENERATED" as const,
  profileVersion: 4,
  detailsVersion: 2,
};

test("saving new content adds version 1, then 2, with the file stored and hashed", async () => {
  const { service, files } = setup();
  const first = await service.save({ ...base, content: { summary: "a" }, file: { bytes: Buffer.from("pdf-a"), mimeType: "application/pdf" } });
  const second = await service.save({ ...base, content: { summary: "b" } });

  assert.equal(first.created, true);
  assert.equal(first.document.version, 1);
  assert.equal(first.document.hasFile, true);
  assert.match(first.document.fileHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(first.document.profileVersion, 4);
  assert.equal(second.document.version, 2);
  assert.equal(second.document.hasFile, false);
  assert.equal(files.size, 1);
});

test("saving the same content again returns the latest version and stores nothing", async () => {
  const { service, rows, files } = setup();
  await service.save({ ...base, content: { summary: "a", items: [1] } });
  const again = await service.save({
    ...base,
    content: { items: [1], summary: "a" },
    file: { bytes: Buffer.from("pdf"), mimeType: "application/pdf" },
  });
  assert.equal(again.created, false);
  assert.equal(again.document.version, 1);
  assert.equal(rows.length, 1);
  assert.equal(files.size, 0);
});

test("versions are counted per document type", async () => {
  const { service } = setup();
  await service.save({ ...base, content: { summary: "a" } });
  const letter = await service.save({ ...base, type: "COVER_LETTER", content: { body: "x" } });
  assert.equal(letter.document.version, 1);
});

test("a failed insert removes the file it stored", async () => {
  const { service, files } = setup({ failInsert: true });
  await assert.rejects(service.save({ ...base, content: { a: 1 }, file: { bytes: Buffer.from("pdf"), mimeType: "application/pdf" } }));
  assert.equal(files.size, 0);
});

test("list rejects an unknown job; getFile returns the PDF with a versioned name", async () => {
  const { service } = setup();
  await assert.rejects(service.list("22222222-2222-4222-8222-222222222222"), (error: unknown) => error instanceof AppError && error.statusCode === 404);
  const { document } = await service.save({ ...base, type: "COVER_LETTER", content: { body: "x" }, file: { bytes: Buffer.from("pdf"), mimeType: "application/pdf" } });
  const file = await service.getFile(document.id);
  assert.equal(file.filename, "cover-letter-v1.pdf");
  assert.equal(file.bytes.toString(), "pdf");
  assert.equal((await service.list(JOB)).length, 1);
});

test("deleteFilesForJob removes every stored file of the job", async () => {
  const { service, files } = setup();
  await service.save({ ...base, content: { a: 1 }, file: { bytes: Buffer.from("1"), mimeType: "application/pdf" } });
  await service.save({ ...base, content: { a: 2 }, file: { bytes: Buffer.from("2"), mimeType: "application/pdf" } });
  await service.deleteFilesForJob(JOB);
  assert.equal(files.size, 0);
});
