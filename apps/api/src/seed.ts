import { count } from "drizzle-orm";

import { hashPassword } from "./auth/password";
import type { Db } from "./db/client";
import { farms, platformAdmins, users } from "./db/schema";
import type { Env } from "./env";
import { bootstrapFarm, generateFarmCode } from "./modules/farm/service";

/** Hiç kullanıcı yoksa ve ortamda seed bilgisi varsa ilk çiftliği, sahibi, ırkları ve varsayılan grubu açar. */
export async function seedIfEmpty(db: Db, env: Env, log: (msg: string) => void) {
  const email = env.SEED_OWNER_EMAIL;
  const password = env.SEED_OWNER_PASSWORD;
  if (!email || !password) return;

  const [row] = await db.select({ value: count() }).from(users);
  if ((row?.value ?? 0) > 0) return;

  await db.transaction(async (tx) => {
    const [farm] = await tx
      .insert(farms)
      .values({ name: env.SEED_FARM_NAME, code: await generateFarmCode(tx), settings: {} })
      .returning();
    if (!farm) throw new Error("Seed: çiftlik oluşturulamadı");
    const [owner] = await tx
      .insert(users)
      .values({
        farmId: farm.id,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        fullName: env.SEED_OWNER_NAME,
        role: "owner",
      })
      .returning({ id: users.id });
    await bootstrapFarm(tx, farm.id, owner?.id ?? null);
  });
  log(`Seed: "${env.SEED_FARM_NAME}" çiftliği, sahip hesabı (${email}), ırklar ve "Ana sürü" oluşturuldu`);
}

/**
 * Platform yöneticisi: tablo boşsa ve ortamda bilgi varsa açılışta oluşturulur.
 * Çiftlik tohumundan ayrı, çünkü süper admin hiçbir çiftliğe bağlı değil.
 */
export async function seedPlatformAdmin(db: Db, env: Env, log: (msg: string) => void) {
  const email = env.PLATFORM_ADMIN_EMAIL;
  const password = env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) return;

  const [row] = await db.select({ value: count() }).from(platformAdmins);
  if ((row?.value ?? 0) > 0) return;

  await db.insert(platformAdmins).values({
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    fullName: env.PLATFORM_ADMIN_NAME,
  });
  log(`Seed: süper admin hesabı oluşturuldu (${email})`);
}
