// Who may reach a route (Milestone 4, ticket 1). Pure decisions; auth-hooks.ts applies them.

const READING_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// The Gmail callback is Google's redirect back, which carries no session cookie: it checks its
// own signed state instead (email-routes.ts).
const PUBLIC_PATHS = new Set(["/health", "/api/auth/session", "/api/auth/sign-in", "/api/auth/sign-out", "/api/email/google/callback"]);

// A request that changes state must come from this app's own page, or from an origin the
// deployment lists. A request with no Origin header is not a browser form post from another
// site, and it still needs the session cookie.
export function originAllowed(input: { method: string; origin: string | undefined; host: string | undefined; allowedOrigins: string[] }): boolean {
  if (READING_METHODS.has(input.method.toUpperCase())) return true;
  if (input.origin === undefined) return true;
  if (input.allowedOrigins.includes(input.origin)) return true;
  try {
    const origin = new URL(input.origin);
    return input.host !== undefined && origin.host === input.host;
  } catch {
    return false;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

// OPEN: no password is configured, so the app keeps working without sign-in, but actions the
// spec reserves for the signed-in user (approving and submitting) are refused.
export type AccessMode = "OPEN" | "SIGN_IN";

export type AccessInput = { mode: AccessMode; path: string; signedIn: boolean; requiresSignIn: boolean };

export type AccessDecision = "ALLOW" | "UNAUTHENTICATED" | "SIGN_IN_NOT_CONFIGURED";

export function accessDecision(input: AccessInput): AccessDecision {
  if (PUBLIC_PATHS.has(input.path) || !input.path.startsWith("/api/")) return "ALLOW";
  if (input.mode === "OPEN") return input.requiresSignIn ? "SIGN_IN_NOT_CONFIGURED" : "ALLOW";
  return input.signedIn ? "ALLOW" : "UNAUTHENTICATED";
}
