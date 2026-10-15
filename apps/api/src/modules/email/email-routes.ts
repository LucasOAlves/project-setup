import type { FastifyInstance } from "fastify";
import { readCookie } from "../auth/request-guard.js";
import { z } from "zod";
import { notFound, providerUnavailable } from "../../app-error.js";
import type { EmailAccountService } from "./email-account-service.js";
import type { ResponseTrackingService } from "./response-tracking-service.js";
import type { RecruiterMailService } from "./recruiter-mail-service.js";

export type MailCheckQueue = { enqueue(): Promise<void>; close(): Promise<void> };

export const OAUTH_STATE_COOKIE = "jh_gmail_state";
export const GMAIL_CALLBACK_PATH = "/api/email/google/callback";

// Recruiter email (Milestone 5, ADR-023): connect Gmail with the read-only scope, see its
// status, and disconnect. Starting and disconnecting need the signed-in user. The callback is
// reached from Google's redirect without the session cookie, so it is public and accepted only
// with the signed state cookie that starting set.
export async function registerEmailRoutes(
  app: FastifyInstance,
  accounts: EmailAccountService,
  mail: Pick<RecruiterMailService, "paste" | "list">,
  checkQueue: MailCheckQueue,
  secureCookie: boolean,
  responses: Pick<ResponseTrackingService, "list" | "accept" | "dismiss">,
): Promise<void> {
  app.addHook("onClose", async () => {
    await checkQueue.close();
  });
  const applicationId = (raw: unknown) => {
    const parsed = z.string().uuid().safeParse(raw);
    if (!parsed.success) throw notFound("Application not found.");
    return parsed.data;
  };
  const messageId = (raw: unknown) => {
    const parsed = z.string().uuid().safeParse(raw);
    if (!parsed.success) throw notFound("Message not found.");
    return parsed.data;
  };
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

  // Reads the mailbox now instead of waiting for the hourly run.
  app.post("/api/email/check", { config: { signedIn: true } }, async (_request, reply) => {
    try {
      await checkQueue.enqueue();
    } catch {
      throw providerUnavailable("The background job queue is unavailable. Is Redis running?");
    }
    return reply.code(202).send({ queued: true });
  });

  // Replies about one application, read from Gmail or pasted.
  app.get("/api/career/applications/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    return { messages: await mail.list(applicationId(id)) };
  });

  // Sent applications with their replies, suggestions and follow-up flags (ticket 5).
  app.get("/api/career/responses", async () => ({ items: await responses.list() }));

  // Only the signed-in user answers a suggestion; accepting changes the job's pursuit status.
  app.post("/api/career/messages/:id/accept", { config: { signedIn: true } }, async (request) => {
    const { id } = request.params as { id: string };
    return { message: await responses.accept(messageId(id)) };
  });

  app.post("/api/career/messages/:id/dismiss", { config: { signedIn: true } }, async (request) => {
    const { id } = request.params as { id: string };
    return { message: await responses.dismiss(messageId(id)) };
  });

  app.post("/api/career/applications/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    return { message: await mail.paste(applicationId(id), request.body) };
  });
}
