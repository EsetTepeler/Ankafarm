import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool };
}
