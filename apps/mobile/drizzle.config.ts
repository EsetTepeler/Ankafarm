import { defineConfig } from "drizzle-kit";

/** Cihazdaki SQLite şeması. Migration'lar src/db/migrations altında JS olarak bundle'a girer. */
export default defineConfig({
  dialect: "sqlite",
  driver: "expo",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
});
