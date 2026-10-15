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

// The same mailbox service for the API (connect, disconnect) and the worker (reading).
export function emailAccountServiceFromEnv(env: Env, db: Database): EmailAccountService {
  const client = env.GOOGLE_OAUTH_CLIENT_ID
    ? { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI }
    : null;
  return new EmailAccountService(new EmailAccountRepository(db), new AuditRepository(db), client, parseEncryptionKey(env.APP_ENCRYPTION_KEY));
}

export function recruiterMailServiceFromEnv(
  env: Env,
  db: Database,
  onStored: (message: RecruiterMessageRow) => Promise<void> = async () => undefined,
): RecruiterMailService {
  const applications = new ApplicationRepository(db);
  return new RecruiterMailService(
    new RecruiterMessageRepository(db),
    emailAccountServiceFromEnv(env, db),
    async (applicationId) => (await applications.get(applicationId)) !== null,
    onStored,
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
