import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { NotificationRepository } from "./notification-repository.js";
import { Notifier } from "./notifier.js";
import { TelegramClient } from "./telegram-client.js";

// Telegram notifications stay off until both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
export function notifierFromEnv(env: Env, db: Database): Notifier {
  const sender = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? new TelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID) : null;
  return new Notifier(sender, new NotificationRepository(db), { appUrl: env.APP_PUBLIC_URL, digestMinScore: env.NOTIFY_DIGEST_MIN_SCORE });
}
