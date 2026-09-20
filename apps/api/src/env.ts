import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL gerekli"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET en az 32 karakter olmalı"),
  /** Virgülle ayrılmış izinli web origin listesi. Boşsa sadece origin'siz (native) istekler. */
  WEB_ORIGIN: z.string().optional(),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  MIGRATIONS_DIR: z.string().default("drizzle"),
  SEED_FARM_NAME: z.string().default("Anka Farm"),
  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_PASSWORD: z.string().min(8).optional(),
  SEED_OWNER_NAME: z.string().default("Çiftlik Sahibi"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Ortam değişkenleri geçersiz:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export function webOrigins(env: Env): string[] {
  return (env.WEB_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
