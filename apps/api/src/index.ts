import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { waitForDatabase } from "./db/wait.js";
import { loadEnv } from "./env.js";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 10 });

  await waitForDatabase(sql);
  await migrate(sql);

  const app = await buildApp(env, createDb(sql));
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
