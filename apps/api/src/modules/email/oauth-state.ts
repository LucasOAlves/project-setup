import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The OAuth "state" for connecting Gmail (Milestone 5). Google's redirect back is a top-level
// navigation from another site, so the SameSite=Strict session cookie is not sent with it.
// Instead, starting the sign-in (which needs the session) sets a short-lived, signed cookie
// holding a nonce, and the callback is accepted only when Google returns that same nonce.

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function sign(key: Buffer, nonce: string, expires: string): string {
  return createHmac("sha256", key).update(`oauth-state:${nonce}.${expires}`).digest("base64url");
}

export function issueOAuthState(key: Buffer, now: Date): { state: string; cookie: string } {
  const nonce = randomBytes(24).toString("base64url");
  const expires = String(now.getTime() + OAUTH_STATE_TTL_MS);
  return { state: nonce, cookie: `${nonce}.${expires}.${sign(key, nonce, expires)}` };
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyOAuthState(key: Buffer, input: { state: string | undefined; cookie: string | undefined }, now: Date): boolean {
  if (!input.state || !input.cookie) return false;
  const [nonce, expires, mac, ...rest] = input.cookie.split(".");
  if (!nonce || !expires || !mac || rest.length > 0) return false;
  if (!same(mac, sign(key, nonce, expires))) return false;
  if (!(Number(expires) >= now.getTime())) return false;
  return same(nonce, input.state);
}
