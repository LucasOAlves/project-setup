import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { AuditRepository } from "../audit/audit-repository.js";
import { EmailAccountRepository } from "./email-account-repository.js";
import { EmailAccountService } from "./email-account-service.js";
import { parseEncryptionKey } from "./secret-box.js";

// The same mailbox service for the API (connect, disconnect) and the worker (reading).
export function emailAccountServiceFromEnv(env: Env, db: Database): EmailAccountService {
  const client = env.GOOGLE_OAUTH_CLIENT_ID
    ? { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI }
    : null;
  return new EmailAccountService(new EmailAccountRepository(db), new AuditRepository(db), client, parseEncryptionKey(env.APP_ENCRYPTION_KEY));
}
