import { JOB_SEARCH_SOURCES } from "@studio/shared";
import { z } from "zod";
import { isPasswordHash } from "./modules/auth/password.js";
import { parseEncryptionKey } from "./modules/email/secret-box.js";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const envSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  MAX_PHOTO_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  TEXT_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  IMAGE_PROVIDER: z.enum(["openai", "pollinations"]).default("openai"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_TEXT_MODEL: z.string().min(1).default("gpt-4.1"),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-1"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_TEXT_MODEL: z.string().min(1).default("claude-opus-5"),
  NEWS_API_KEY: z.string().optional().default(""),
  NEWS_LOOKBACK_DAYS: z.coerce.number().int().positive().max(30).default(21),
  ADZUNA_APP_ID: z.string().optional().default(""),
  ADZUNA_APP_KEY: z.string().optional().default(""),
  // Single-user sign-in (Milestone 4). Empty leaves the app open, except approving and
  // submitting, which need a signed-in session. Make the hash with `npm run hash-password`.
  APP_PASSWORD_HASH: z.string().optional().default(""),
  SESSION_SECRET: z.string().optional().default(""),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(24 * 7),
  // "auto" sets the cookie's Secure flag only when NODE_ENV=production.
  SESSION_COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
  // Origins other than the app's own that may send state-changing requests. Usually empty,
  // since the web app reaches the API through its own /api proxy.
  APP_ORIGINS: z.string().optional().default("").transform(splitList),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  WORKER_HEARTBEAT_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  // Browser worker (Milestone 3). Empty uses Playwright's own Chromium.
  BROWSER_EXECUTABLE_PATH: z.string().default(""),
  BROWSER_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // Milestone 4: lets the browser worker submit approved applications on portals set to
  // AUTOMATED in source settings. Off by default; approving then leads to the assisted path.
  APPLICATION_SUBMISSION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Encryption at rest for stored secrets such as the Gmail refresh token (Milestone 5): 32
  // random bytes as base64 or hex, e.g. `openssl rand -base64 32`.
  APP_ENCRYPTION_KEY: z.string().optional().default(""),
  // Recruiter email (Milestone 5): your own Google OAuth client, read-only Gmail scope. The
  // redirect URI is this app's /api/email/google/callback, as registered on the client.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional().default(""),
  // Development only: serve the mock portals instead of the network, to try the flow locally.
  BROWSER_MOCK_PORTALS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Scheduled discovery (JOB-009): which search sources run, with which keywords, when.
  DISCOVERY_SOURCES: z
    .string()
    .default("remotive,himalayas,remoteok,arbeitnow,weworkremotely")
    .transform(splitList)
    .pipe(z.array(z.enum(JOB_SEARCH_SOURCES))),
  // Each keyword is one request per source per run, so synonyms belong in MATCH_TARGET_ROLES.
  DISCOVERY_KEYWORDS: z
    .string()
    .default("typescript,node.js,angular,tech lead,forward deployed engineer,ai engineer")
    .transform(splitList),
  DISCOVERY_CRON: z.string().min(1).default("0 9 * * *"),
  // Web search discovery (Brave Search API): off without a key. One search per ATS domain per
  // day for these titles, so the daily count stays at six whatever the list holds.
  BRAVE_SEARCH_API_KEY: z.string().optional().default(""),
  WEB_SEARCH_TITLES: z
    .string()
    .default("senior software engineer,senior fullstack engineer,tech lead,forward deployed engineer,ai engineer")
    .transform(splitList),
  DISCOVERY_TZ: z.string().min(1).default("America/Sao_Paulo"),
  // Matching v2 compensation target, in USD per month (JOB-011).
  MATCH_TARGET_USD_MONTHLY: z.coerce.number().int().positive().default(6000),
  // Words or phrases a wanted role title contains, synonyms included. Empty keeps the defaults.
  MATCH_TARGET_ROLES: z.string().optional().default("").transform(splitList),
  // Explanation agent (JOB-012): shortlist threshold and the daily model-cost limit.
  EXPLANATION_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(60),
  EXPLANATION_DAILY_LIMIT: z.coerce.number().int().min(0).default(25),
  // Model cost ledger (Milestone 5): monthly budget in USD for estimated model and search cost.
  // 0 turns the budget off (costs are still recorded). Optional calls stop once it is reached.
  AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(0),
  // Response tracking (Milestone 5): days without a reply before "consider following up".
  FOLLOW_UP_AFTER_DAYS: z.coerce.number().int().min(1).default(10),
}).superRefine((env, context) => {
  if (env.APP_PASSWORD_HASH && !isPasswordHash(env.APP_PASSWORD_HASH)) {
    context.addIssue({ code: "custom", path: ["APP_PASSWORD_HASH"], message: "Not a hash from `npm run hash-password`." });
  }
  if (env.APP_PASSWORD_HASH && env.SESSION_SECRET.length < 32) {
    context.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Set at least 32 random characters when APP_PASSWORD_HASH is set." });
  }
  try {
    parseEncryptionKey(env.APP_ENCRYPTION_KEY);
  } catch (error) {
    context.addIssue({ code: "custom", path: ["APP_ENCRYPTION_KEY"], message: (error as Error).message });
  }
  if (env.GOOGLE_OAUTH_CLIENT_ID && (!env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI || !env.APP_ENCRYPTION_KEY)) {
    context.addIssue({
      code: "custom",
      path: ["GOOGLE_OAUTH_CLIENT_ID"],
      message: "Gmail needs GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI and APP_ENCRYPTION_KEY too.",
    });
  }
  if (env.NODE_ENV === "production" && !env.APP_PASSWORD_HASH) {
    context.addIssue({ code: "custom", path: ["APP_PASSWORD_HASH"], message: "Production needs a sign-in password." });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
