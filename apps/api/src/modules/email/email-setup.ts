import { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { Database } from "../../db/client.js";
import { createQueue, enqueueEmailCheck, QUEUE_NAMES } from "../../worker/queues.js";
import type { MailCheckQueue } from "./email-routes.js";
import type { Env } from "../../env.js";
import { AuditRepository } from "../audit/audit-repository.js";
import { EmailAccountRepository } from "./email-account-repository.js";
import { EmailAccountService } from "./email-account-service.js";
import { RecruiterMailService } from "./recruiter-mail-service.js";
import { RecruiterMessageRepository } from "./recruiter-message-repository.js";
import { ApplicationRepository } from "../career/application-repository.js";
import type { RecruiterMessageRow } from "./recruiter-message-repository.js";
import { parseEncryptionKey } from "./secret-box.js";
import { MessageClassifier } from "./message-classifier.js";
import { suggestionFor } from "./response-tracking.js";
import { AnthropicTextGenerationProvider } from "../ai/anthropic-text-generation-provider.js";
import { OpenAITextGenerationProvider } from "../ai/openai-text-generation-provider.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";

// The same mailbox service for the API (connect, disconnect) and the worker (reading).
export function emailAccountServiceFromEnv(env: Env, db: Database): EmailAccountService {
  const client = env.GOOGLE_OAUTH_CLIENT_ID
    ? { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI }
    : null;
  return new EmailAccountService(new EmailAccountRepository(db), new AuditRepository(db), client, parseEncryptionKey(env.APP_ENCRYPTION_KEY));
}

// The configured default text provider, or null without its API key.
export function defaultTextProvider(env: Env): TextGenerationProvider | null {
  if (env.TEXT_PROVIDER === "anthropic") {
    return env.ANTHROPIC_API_KEY ? new AnthropicTextGenerationProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_TEXT_MODEL) : null;
  }
  return env.OPENAI_API_KEY ? new OpenAITextGenerationProvider(env.OPENAI_API_KEY, env.OPENAI_TEXT_MODEL) : null;
}

// Each stored message is classified right away (by rules, then the default text provider),
// and its class becomes a status suggestion when it would move the job forward.
export function classifyStoredMessage(repo: Pick<RecruiterMessageRepository, "jobFor" | "setClassification">, classifier: Pick<MessageClassifier, "classify">) {
  return async (message: RecruiterMessageRow): Promise<RecruiterMessageRow | null> => {
    if (!message.applicationId || message.body === null) return null;
    const result = await classifier.classify({ subject: message.subject, body: message.body });
    const job = await repo.jobFor(message.applicationId);
    const suggestedStatus = job ? suggestionFor(result.classification, job.status) : "";
    return repo.setClassification(message.id, { ...result, suggestedStatus });
  };
}

export function recruiterMailServiceFromEnv(env: Env, db: Database): RecruiterMailService {
  const applications = new ApplicationRepository(db);
  const repo = new RecruiterMessageRepository(db);
  return new RecruiterMailService(
    repo,
    emailAccountServiceFromEnv(env, db),
    async (applicationId) => (await applications.get(applicationId)) !== null,
    classifyStoredMessage(repo, new MessageClassifier(defaultTextProvider(env))),
  );
}

// The API's producer for "check now": a fail-fast connection, opened on first use.
export function mailCheckQueue(redisUrl: string): MailCheckQueue {
  let connection: Redis | null = null;
  let queue: Queue | null = null;
  return {
    async enqueue() {
      connection ??= new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      queue ??= createQueue(QUEUE_NAMES.monitoring, connection);
      await enqueueEmailCheck(queue);
    },
    async close() {
      await queue?.close();
      connection?.disconnect();
    },
  };
}
