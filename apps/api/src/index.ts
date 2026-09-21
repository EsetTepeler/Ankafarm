import { existsSync } from "node:fs";

import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

import { createTokenService } from "./auth/tokens";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { registerUploadRoutes } from "./modules/uploads/routes";
import { loadEnv, webOrigins } from "./env";
import { createRealtime } from "./modules/realtime";
import { appRouter, type AppRouter } from "./router";
import { seedIfEmpty } from "./seed";
import { makeContextFactory } from "./trpc/context";

async function main() {
  // Yerel geliştirmede .env dosyası; üretimde değişkenler konteynerden gelir.
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");
  const env = loadEnv();
  const app = Fastify({ logger: { level: env.NODE_ENV === "production" ? "info" : "debug" } });

  await runMigrations(env.DATABASE_URL, env.MIGRATIONS_DIR);
  app.log.info("Migration'lar güncel");

  const { db, pool } = createDb(env.DATABASE_URL);
  const tokens = createTokenService(env.JWT_SECRET, env.ACCESS_TOKEN_TTL_MINUTES);
  await seedIfEmpty(db, env, (m) => app.log.info(m));

  const origins = webOrigins(env);
  await app.register(cors, {
    // Dosya uçları PUT ve DELETE kullanıyor; varsayılan liste yalnızca GET/HEAD/POST.
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    origin: (origin, cb) => {
      // Native uygulamalar origin göndermez; web sadece izinli listeden. Geliştirmede serbest.
      if (!origin || origins.includes(origin) || env.NODE_ENV !== "production") return cb(null, true);
      cb(null, false);
    },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.get("/health", async () => {
    await pool.query("select 1");
    return { ok: true, time: new Date().toISOString() };
  });

  const realtime = createRealtime(app, tokens, origins, env.NODE_ENV === "production");
  registerUploadRoutes(app, db, tokens, env.UPLOADS_DIR);

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: makeContextFactory({ db, env, tokens, realtime }),
      onError({ path, error }) {
        if (error.code === "INTERNAL_SERVER_ERROR") app.log.error({ path, err: error }, "tRPC hatası");
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  const shutdown = async () => {
    app.log.info("Kapanıyor");
    await realtime.close();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
