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
  /** Ek dosyaların yazıldığı dizin; Docker'da uploads birimi. */
  UPLOADS_DIR: z.string().default("uploads"),
  /** Python içgörü servisi; boşsa tetikleme yapılmaz, gece işi yine çalışır. */
  INSIGHTS_URL: z.string().url().optional(),
  /** İçgörü servisinin DB rolü parolası; verilirse rol açılışta oluşturulur/güncellenir. */
  INSIGHTS_DB_PASSWORD: z.string().min(8).optional(),
  SEED_FARM_NAME: z.string().default("Anka Farm"),
  SEED_OWNER_EMAIL: z.string().email().optional(),
  SEED_OWNER_PASSWORD: z.string().min(8).optional(),
  SEED_OWNER_NAME: z.string().default("Çiftlik Sahibi"),
  /** Platform yöneticisi (süper admin); tablo boşsa açılışta oluşturulur. */
  PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_PASSWORD: z.string().min(8).optional(),
  PLATFORM_ADMIN_NAME: z.string().default("Süper Admin"),
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

/** İzinli web origin'leri. Her adresin www'lu ve www'suz hali birlikte kabul edilir; nginx www'yi ana adrese yönlendirir ama eski sekmeler kalabilir. */
export function webOrigins(env: Env): string[] {
  const out = new Set<string>();
  for (const raw of (env.WEB_ORIGIN ?? "").split(",")) {
    const origin = raw.trim().replace(/\/+$/, "");
    if (!origin) continue;
    out.add(origin);
    const m = origin.match(/^(https?:\/\/)(www\.)?(.+)$/i);
    if (m) {
      out.add(`${m[1]}${m[3]}`);
      out.add(`${m[1]}www.${m[3]}`);
    }
  }
  return [...out];
}
