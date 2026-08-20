import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(sql: postgres.Sql) {
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
