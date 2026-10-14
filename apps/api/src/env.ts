import { JOB_SEARCH_SOURCES } from "@studio/shared";
import { z } from "zod";

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
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  WORKER_HEARTBEAT_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  // Scheduled discovery (JOB-009): which search sources run, with which keywords, when.
  DISCOVERY_SOURCES: z
    .string()
    .default("remotive,himalayas,remoteok,arbeitnow")
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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
