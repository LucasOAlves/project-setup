import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption at rest for secrets the app must keep, such as the Gmail refresh token (spec
// section 6, Milestone 5). AES-256-GCM with a fresh 12-byte IV per value. The purpose is bound
// as associated data, so a value sealed for one use cannot be opened as another. Format:
// v1.<iv>.<tag>.<ciphertext>, each part base64url.

const VERSION = "v1";

// APP_ENCRYPTION_KEY: 32 random bytes as base64 or hex. Empty means not configured.
export function parseEncryptionKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, as base64 or hex.");
  return key;
}

export function sealSecret(key: Buffer, purpose: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

// Throws when the key, the purpose or the value does not match.
export function openSecret(key: Buffer, purpose: string, sealed: string): string {
  const [version, iv, tag, body, ...rest] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined || rest.length > 0) throw new Error("Not a sealed secret.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(purpose, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
