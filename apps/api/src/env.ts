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
  DISCOVERY_KEYWORDS: z.string().default("typescript,node.js,angular,tech lead").transform(splitList),
  DISCOVERY_CRON: z.string().min(1).default("0 9 * * *"),
  DISCOVERY_TZ: z.string().min(1).default("America/Sao_Paulo"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
