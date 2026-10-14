import { createHmac, timingSafeEqual } from "node:crypto";

// Single-user sessions (Milestone 4, ticket 1): a signed token in an httpOnly cookie, with no
// session table. The key mixes the session secret with the stored password hash, so changing
// the password ends every existing session.

export type SessionCheck =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: "MISSING" | "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" };

const MIN_SECRET_LENGTH = 32;

export function sessionKey(secret: string, passwordHash: string): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  return createHmac("sha256", secret).update(`session:${passwordHash}`).digest("base64url");
}

function sign(key: string, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(key: string, now: Date, ttlMs: number): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, iat: now.getTime(), exp: now.getTime() + ttlMs })).toString("base64url");
  return `${payload}.${sign(key, payload)}`;
}

export function verifySessionToken(token: string | undefined, key: string, now: Date): SessionCheck {
  if (!token) return { ok: false, reason: "MISSING" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "MALFORMED" };
  const [payload, signature] = parts as [string, string];

  const expected = Buffer.from(sign(key, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "BAD_SIGNATURE" };

  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  const { v, exp } = (body ?? {}) as { v?: unknown; exp?: unknown };
  if (v !== 1 || typeof exp !== "number" || !Number.isFinite(exp)) return { ok: false, reason: "MALFORMED" };
  if (now.getTime() >= exp) return { ok: false, reason: "EXPIRED" };
  return { ok: true, expiresAt: new Date(exp) };
}
