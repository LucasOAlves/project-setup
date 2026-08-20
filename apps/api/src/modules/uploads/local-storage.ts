import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.js";
import type { StorageObject, StorageProvider } from "./storage-provider.js";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  async put(input: {
    bytes: Buffer;
    mimeType: string;
    extension: string;
  }): Promise<{ key: string }> {
    const extension = MIME_EXTENSION[input.mimeType] ?? sanitizeExtension(input.extension);
    const key = `${randomUUID()}.${extension}`;
    const absolute = this.absolutePath(key);

    try {
      await mkdir(this.rootDir, { recursive: true });
      await writeFile(absolute, input.bytes);
      return { key };
    } catch {
      throw new AppError(ERROR_CODES.STORAGE_FAILURE, "Could not store the file.", 500);
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    if (!isServerKey(key)) {
      return null;
    }

    try {
      const bytes = await readFile(this.absolutePath(key));
      return {
        key,
        bytes,
        mimeType: mimeFromKey(key),
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!isServerKey(key)) {
      return;
    }

    try {
      await unlink(this.absolutePath(key));
    } catch {
      // Missing files are not a client-facing failure during cleanup.
    }
  }

  private absolutePath(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    const root = path.resolve(this.rootDir);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new AppError(ERROR_CODES.STORAGE_FAILURE, "Invalid storage key.", 400);
    }
    return resolved;
  }
}

function sanitizeExtension(extension: string): string {
  const cleaned = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return cleaned || "bin";
}

function isServerKey(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(
    key,
  );
}

function mimeFromKey(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
