import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "./client";

/** Uygulama açılışında bekleyen migration'ları uygular. */
export async function runMigrations(databaseUrl: string, migrationsDir: string) {
  const { db, pool } = createDb(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), migrationsDir) });
  } finally {
    await pool.end();
  }
}

// `pnpm db:migrate` ile doğrudan çalıştırma.
const isDirectRun = process.argv[1]?.endsWith("migrate.ts");
if (isDirectRun) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL gerekli");
  runMigrations(url, process.env.MIGRATIONS_DIR ?? "drizzle")
    .then(() => console.log("Migration tamam"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
