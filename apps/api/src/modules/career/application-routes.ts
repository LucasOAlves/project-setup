import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { notFound } from "../../app-error.js";
import type { ApplicationAnswerService } from "./application-answer-service.js";
import type { ApplicationDispatcher } from "./application-dispatcher.js";
import type { ApplicationService } from "./application-service.js";
import type { StorageProvider } from "../uploads/storage-provider.js";

const idSchema = z.string().uuid();

function parseId(raw: unknown, what: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw notFound(`${what} not found.`);
  return parsed.data;
}

// Applications: prepare one job's application, read it with its history, reject it
// (Milestone 3), and approve it, withdraw the approval, list the inbox and record what was
// sent (Milestone 4).
export async function registerApplicationRoutes(
  app: FastifyInstance,
  applications: ApplicationService,
  dispatcher: Pick<ApplicationDispatcher, "dispatch" | "dispatchSubmission" | "close">,
  storage: Pick<StorageProvider, "get">,
  answers: Pick<ApplicationAnswerService, "save">,
  submissionEnabled = false,
): Promise<void> {
  app.addHook("onClose", async () => {
    await dispatcher.close();
  });

  app.post("/api/career/jobs/:id/application/prepare", async (request, reply) => {
    const { id } = request.params as { id: string };
    const started = await applications.startPreparation(parseId(id, "Job"));
    return reply.code(202).send({ application: await dispatcher.dispatch(started) });
  });

  // The approval inbox: applications that wait on you or are being submitted.
  app.get("/api/career/applications", async () => {
    return { items: await applications.inbox(), submissionEnabled };
  });

  app.get("/api/career/jobs/:id/application", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.getForJob(parseId(id, "Job")) };
  });

  // The last preview's screenshot, with every typed value masked. Kept for 30 days.
  app.get("/api/career/applications/:id/preview.png", async (request, reply) => {
    const { id } = request.params as { id: string };
    const key = await applications.screenshotKey(parseId(id, "Application"));
    const file = key ? await storage.get(key) : null;
    if (!file) throw notFound("No preview screenshot is kept for this application.");
    return reply.header("content-type", "image/png").header("cache-control", "no-store").send(file.bytes);
  });

  // Answers to the open questions. Preparing again uses them.
  app.post("/api/career/applications/:id/answers", async (request) => {
    const { id } = request.params as { id: string };
    return answers.save(parseId(id, "Application"), request.body);
  });

  // Approving needs the signed-in user (Milestone 4, ADR-021). The body carries the payload
  // hash the user reviewed.
  // When submission is permitted, approving also queues the submission. If the queue is down
  // the approval is kept and "submit" queues it later.
  app.post("/api/career/applications/:id/approve", { config: { signedIn: true } }, async (request) => {
    const { id } = request.params as { id: string };
    const approved = await applications.approve(parseId(id, "Application"), request.body);
    let queued = false;
    if (approved.submission.allowed) {
      queued = await dispatcher
        .dispatchSubmission(approved)
        .then(() => true)
        .catch(() => false);
    }
    return { application: approved, queued };
  });

  app.post("/api/career/applications/:id/submit", { config: { signedIn: true } }, async (request) => {
    const { id } = request.params as { id: string };
    const application = await applications.get(parseId(id, "Application"));
    await dispatcher.dispatchSubmission(application);
    return { application, queued: true };
  });

  app.post("/api/career/applications/:id/approval/withdraw", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.withdrawApproval(parseId(id, "Application")) };
  });

  // You submitted it yourself, or checked that an unclear submission was sent.
  app.post("/api/career/applications/:id/mark-submitted", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.markSubmitted(parseId(id, "Application")) };
  });

  // You checked that an unclear submission was not sent: back to review, with a new approval needed.
  app.post("/api/career/applications/:id/mark-not-sent", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.markNotSent(parseId(id, "Application")) };
  });

  app.post("/api/career/applications/:id/reject", async (request) => {
    const { id } = request.params as { id: string };
    return { application: await applications.reject(parseId(id, "Application")) };
  });
}
