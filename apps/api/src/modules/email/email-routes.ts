import type { FastifyInstance } from "fastify";
import { readCookie } from "../auth/request-guard.js";
import type { EmailAccountService } from "./email-account-service.js";

export const OAUTH_STATE_COOKIE = "jh_gmail_state";
export const GMAIL_CALLBACK_PATH = "/api/email/google/callback";

// Recruiter email (Milestone 5, ADR-023): connect Gmail with the read-only scope, see its
// status, and disconnect. Starting and disconnecting need the signed-in user. The callback is
// reached from Google's redirect without the session cookie, so it is public and accepted only
// with the signed state cookie that starting set.
export async function registerEmailRoutes(app: FastifyInstance, accounts: EmailAccountService, secureCookie: boolean): Promise<void> {
  const stateCookie = (value: string, maxAge: number) =>
    [`${OAUTH_STATE_COOKIE}=${value}`, "HttpOnly", "SameSite=Lax", `Path=${GMAIL_CALLBACK_PATH}`, `Max-Age=${maxAge}`, ...(secureCookie ? ["Secure"] : [])].join("; ");

  app.get("/api/email/account", async () => accounts.status());

  app.post("/api/email/google/start", { config: { signedIn: true } }, async (_request, reply) => {
    const { url, cookie } = accounts.start();
    reply.header("Set-Cookie", stateCookie(cookie, 600));
    return { url };
  });

  app.get(GMAIL_CALLBACK_PATH, async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    reply.header("Set-Cookie", stateCookie("", 0));
    try {
      await accounts.complete({
        code: query.code,
        state: query.state,
        error: query.error,
        cookie: readCookie(request.headers.cookie, OAUTH_STATE_COOKIE),
      });
      return reply.redirect("/?email=connected");
    } catch (error) {
      request.log.warn({ reason: (error as Error).message }, "gmail connect failed");
      return reply.redirect("/?email=failed");
    }
  });

  app.post("/api/email/disconnect", { config: { signedIn: true } }, async () => accounts.disconnect());
}
