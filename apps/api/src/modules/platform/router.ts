import {
  createFarmInputSchema,
  farmStatusSchema,
  loginInputSchema,
  refreshInputSchema,
  totpDisableInputSchema,
  totpEnableInputSchema,
  totpLoginInputSchema,
} from "@anka/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { hashPassword, verifyPassword } from "../../auth/password";
import { assertNotLocked, platformLoginThrottle, recordFailure, recordSuccess } from "../../auth/throttle";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from "../../auth/totp";
import { hashRefreshToken } from "../../auth/tokens";
import { farms, platformAdmins, platformRecoveryCodes, platformRefreshTokens, refreshTokens, users } from "../../db/schema";
import type { Context } from "../../trpc/context";
import { publicProcedure, router, superAdminProcedure } from "../../trpc/init";
import { bootstrapFarm, generateFarmCode } from "../farm/service";

async function issuePlatformTokens(ctx: Context, adminId: string, device?: string) {
  const accessToken = await ctx.tokens.signPlatformToken({ sub: adminId, kind: "platform" });
  const refresh = ctx.tokens.newRefreshToken();
  const expiresAt = new Date(Date.now() + ctx.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await ctx.db.insert(platformRefreshTokens).values({ adminId, tokenHash: refresh.hash, expiresAt, device: device ?? null });
  return { accessToken, refreshToken: refresh.token, accessExpiresInSeconds: ctx.env.ACCESS_TOKEN_TTL_MINUTES * 60 };
}

/**
 * Ham sql sonucu sürücüden bazen Date, bazen Postgres'in timestamptz metni olarak geliyor
 * ("2026-09-21 20:55:27+00"). Metin ISO değil: boşluk T'ye çevrilmeden Date kurmak güvenilir değil.
 */
function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  // "2026-09-22 17:45:05.019+00" -> "2026-09-22T17:45:05.019+00:00"
  // Boşluk ve iki haneli saat dilimi ISO değil; ikisi de düzeltilmeden Date geçersiz çıkıyor.
  const iso = String(value)
    .replace(" ", "T")
    .replace(/([+-])(\d{2})$/, "$1$2:00");
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Kurtarma kodu tek kullanımlık. Kodlar yüksek entropili değil (40 bit), o yüzden şifre gibi
 * scrypt ile saklanıyor; veritabanı sızsa bile kaba kuvvet pahalı olsun.
 */
async function consumeRecoveryCode(db: Context["db"], adminId: string, input: string): Promise<boolean> {
  const clean = normalizeRecoveryCode(input);
  if (clean.length < 8) return false;
  const rows = await db
    .select()
    .from(platformRecoveryCodes)
    .where(and(eq(platformRecoveryCodes.adminId, adminId), isNull(platformRecoveryCodes.usedAt)));
  for (const row of rows) {
    if (await verifyPassword(clean, row.codeHash)) {
      await db.update(platformRecoveryCodes).set({ usedAt: new Date() }).where(eq(platformRecoveryCodes.id, row.id));
      return true;
    }
  }
  return false;
}

const publicAdmin = { id: platformAdmins.id, email: platformAdmins.email, fullName: platformAdmins.fullName, active: platformAdmins.active };

/**
 * Platform yönetimi: kiracıları açar, askıya alır ve sayar. Çiftlik verisine dokunmaz —
 * hayvan, sağlık ve finans kayıtları yalnızca o çiftliğin kendi kullanıcılarına açık.
 */
export const platformRouter = router({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
    // Hem e-posta hem IP sayılır: tek hesabı zorlamak da, adres değiştirip denemek de kısıtlansın.
    const keys = [`platform:${input.email}`, `platform-ip:${ctx.req.ip}`];
    for (const key of keys) assertNotLocked(key, platformLoginThrottle);

    const [admin] = await ctx.db.select().from(platformAdmins).where(eq(platformAdmins.email, input.email)).limit(1);
    const ok = admin ? await verifyPassword(input.password, admin.passwordHash) : false;
    if (!admin || !ok) {
      const locked = keys.map((key) => recordFailure(key, platformLoginThrottle)).some(Boolean);
      // Yönetici girişi tüm kiracıları açıyor; başarısız denemeler günlüğe düşsün.
      ctx.req.log.warn({ email: input.email, ip: ctx.req.ip, locked }, "platform yönetici girişi başarısız");
      throw new TRPCError({ code: "UNAUTHORIZED", message: "E-posta veya şifre hatalı" });
    }
    if (!admin.active) throw new TRPCError({ code: "FORBIDDEN", message: "Hesap devre dışı" });
    for (const key of keys) recordSuccess(key);

    // 2FA açıksa şifre tek başına yetmez: kısa ömürlü aşama tokenı döner, oturum ikinci adımda açılır.
    if (admin.totpEnabled) {
      const challengeToken = await ctx.tokens.signTotpChallenge({ sub: admin.id, kind: "platform-totp" });
      return { status: "totp" as const, challengeToken };
    }

    await ctx.db.update(platformAdmins).set({ lastLoginAt: new Date() }).where(eq(platformAdmins.id, admin.id));
    const tokens = await issuePlatformTokens(ctx, admin.id, input.device);
    return { status: "ok" as const, ...tokens, admin: { id: admin.id, email: admin.email, fullName: admin.fullName } };
  }),

  /** İkinci adım: kimlik doğrulayıcı kodu ya da tek kullanımlık kurtarma kodu. */
  loginTotp: publicProcedure.input(totpLoginInputSchema).mutation(async ({ ctx, input }) => {
    const claims = await ctx.tokens.verifyTotpChallenge(input.challengeToken);
    if (!claims) throw new TRPCError({ code: "UNAUTHORIZED", message: "Doğrulama süresi doldu, baştan giriş yapın" });

    // Altı hane 1.000.000 ihtimal; kısıt olmadan denenebilir.
    const key = `platform-totp:${claims.sub}`;
    assertNotLocked(key, platformLoginThrottle);

    const [admin] = await ctx.db.select().from(platformAdmins).where(eq(platformAdmins.id, claims.sub)).limit(1);
    if (!admin || !admin.active || !admin.totpEnabled || !admin.totpSecret) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Doğrulama yapılamadı" });
    }

    let ok = verifyTotp(admin.totpSecret, input.code);
    let usedRecovery = false;
    if (!ok) ok = usedRecovery = await consumeRecoveryCode(ctx.db, admin.id, input.code);
    if (!ok) {
      const locked = recordFailure(key, platformLoginThrottle);
      ctx.req.log.warn({ adminId: admin.id, ip: ctx.req.ip, locked }, "yönetici ikinci adım doğrulaması başarısız");
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Kod doğrulanamadı" });
    }
    recordSuccess(key);
    if (usedRecovery) ctx.req.log.warn({ adminId: admin.id, ip: ctx.req.ip }, "yönetici girişinde kurtarma kodu kullanıldı");

    await ctx.db.update(platformAdmins).set({ lastLoginAt: new Date() }).where(eq(platformAdmins.id, admin.id));
    const tokens = await issuePlatformTokens(ctx, admin.id, input.device);
    return { status: "ok" as const, ...tokens, admin: { id: admin.id, email: admin.email, fullName: admin.fullName }, usedRecovery };
  }),

  refresh: publicProcedure.input(refreshInputSchema).mutation(async ({ ctx, input }) => {
    const hash = hashRefreshToken(input.refreshToken);
    const [row] = await ctx.db
      .select({ token: platformRefreshTokens, admin: platformAdmins })
      .from(platformRefreshTokens)
      .innerJoin(platformAdmins, eq(platformAdmins.id, platformRefreshTokens.adminId))
      .where(and(eq(platformRefreshTokens.tokenHash, hash), isNull(platformRefreshTokens.revokedAt)))
      .limit(1);
    if (!row || row.token.expiresAt < new Date() || !row.admin.active) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Oturum süresi doldu, yeniden giriş yapın" });
    }
    await ctx.db.update(platformRefreshTokens).set({ revokedAt: new Date() }).where(eq(platformRefreshTokens.id, row.token.id));
    const tokens = await issuePlatformTokens(ctx, row.admin.id, row.token.device ?? undefined);
    return { ...tokens, admin: { id: row.admin.id, email: row.admin.email, fullName: row.admin.fullName } };
  }),

  logout: publicProcedure.input(refreshInputSchema).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(platformRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(platformRefreshTokens.tokenHash, hashRefreshToken(input.refreshToken)));
    return { ok: true };
  }),

  me: superAdminProcedure.query(async ({ ctx }) => {
    const [admin] = await ctx.db
      .select({ ...publicAdmin, totpEnabled: platformAdmins.totpEnabled })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, ctx.admin.sub))
      .limit(1);
    if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Yönetici bulunamadı" });
    const [left] = await ctx.db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(platformRecoveryCodes)
      .where(and(eq(platformRecoveryCodes.adminId, ctx.admin.sub), isNull(platformRecoveryCodes.usedAt)));
    return { ...admin, recoveryCodesLeft: left?.value ?? 0 };
  }),

  /** Kurulum: gizli anahtar üretilir ve saklanır ama kod doğrulanana kadar etkinleşmez. */
  totpSetup: superAdminProcedure.mutation(async ({ ctx }) => {
    const [admin] = await ctx.db.select().from(platformAdmins).where(eq(platformAdmins.id, ctx.admin.sub)).limit(1);
    if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Yönetici bulunamadı" });
    if (admin.totpEnabled) throw new TRPCError({ code: "BAD_REQUEST", message: "İki adımlı doğrulama zaten açık" });
    const secret = generateTotpSecret();
    await ctx.db.update(platformAdmins).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(platformAdmins.id, admin.id));
    return { secret, uri: otpauthUri(secret, admin.email) };
  }),

  /** Kod doğrulanınca etkinleşir; kurtarma kodları bir kez gösterilir, sonra yalnızca özeti kalır. */
  totpEnable: superAdminProcedure.input(totpEnableInputSchema).mutation(async ({ ctx, input }) => {
    const [admin] = await ctx.db.select().from(platformAdmins).where(eq(platformAdmins.id, ctx.admin.sub)).limit(1);
    if (!admin?.totpSecret) throw new TRPCError({ code: "BAD_REQUEST", message: "Önce kurulumu başlatın" });
    if (!verifyTotp(admin.totpSecret, input.code)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Kod doğrulanamadı; telefonun saati doğru mu?" });
    }
    const codes = generateRecoveryCodes();
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(platformAdmins)
        .set({ totpEnabled: true, totpConfirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(platformAdmins.id, admin.id));
      await tx.delete(platformRecoveryCodes).where(eq(platformRecoveryCodes.adminId, admin.id));
      for (const code of codes) {
        await tx.insert(platformRecoveryCodes).values({ adminId: admin.id, codeHash: await hashPassword(normalizeRecoveryCode(code)) });
      }
    });
    ctx.req.log.warn({ adminId: admin.id }, "yönetici hesabında iki adımlı doğrulama açıldı");
    return { recoveryCodes: codes };
  }),

  /** Kapatmak şifre ister: çalınan oturum 2FA'yı tek başına kaldıramasın. */
  totpDisable: superAdminProcedure.input(totpDisableInputSchema).mutation(async ({ ctx, input }) => {
    const [admin] = await ctx.db.select().from(platformAdmins).where(eq(platformAdmins.id, ctx.admin.sub)).limit(1);
    if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Yönetici bulunamadı" });
    if (!(await verifyPassword(input.password, admin.passwordHash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Şifre hatalı" });
    }
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(platformAdmins)
        .set({ totpEnabled: false, totpSecret: null, totpConfirmedAt: null, updatedAt: new Date() })
        .where(eq(platformAdmins.id, admin.id));
      await tx.delete(platformRecoveryCodes).where(eq(platformRecoveryCodes.adminId, admin.id));
    });
    ctx.req.log.warn({ adminId: admin.id, ip: ctx.req.ip }, "yönetici hesabında iki adımlı doğrulama kapatıldı");
    return { ok: true };
  }),

  /**
   * Kiracı listesi: sayfaçlar ve son etkinlik. Sayımlar ilişkili alt sorgu olarak yazıldı;
   * iki ayrı join'de her ikisi de "value" sütunu ürettiği için referans belirsiz kalıyordu.
   */
  farms: superAdminProcedure.query(async ({ ctx }) =>
    ctx.db
      .select({
        id: farms.id,
        code: farms.code,
        name: farms.name,
        location: farms.location,
        status: farms.status,
        createdAt: farms.createdAt,
        animalCount: sql<number>`(select count(*) from animals a where a.farm_id = farms.id and a.deleted_at is null)`.mapWith(Number),
        userCount: sql<number>`(select count(*) from users u where u.farm_id = farms.id)`.mapWith(Number),
        lastLoginAt: sql<string | Date | null>`(select max(u.last_login_at) from users u where u.farm_id = farms.id)`.mapWith(toDate),
      })
      .from(farms)
      .orderBy(desc(farms.createdAt)),
  ),

  /** Yeni kiracı: çiftlik, ilk sahip ve tohumlar (ırklar, Ana sürü, stok kalemleri, gözlem etiketleri). */
  createFarm: superAdminProcedure.input(createFarmInputSchema).mutation(async ({ ctx, input }) => {
    const [taken] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.ownerEmail)).limit(1);
    if (taken) throw new TRPCError({ code: "CONFLICT", message: "Bu e-posta zaten kayıtlı" });

    return ctx.db.transaction(async (tx) => {
      const [farm] = await tx
        .insert(farms)
        .values({ name: input.name, location: input.location ?? null, code: await generateFarmCode(tx), settings: {} })
        .returning();
      if (!farm) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Çiftlik oluşturulamadı" });
      const [owner] = await tx
        .insert(users)
        .values({
          farmId: farm.id,
          email: input.ownerEmail,
          passwordHash: await hashPassword(input.ownerPassword),
          fullName: input.ownerFullName,
          role: "owner",
        })
        .returning({ id: users.id });
      await bootstrapFarm(tx, farm.id, owner?.id ?? null);
      return farm;
    });
  }),

  /** Askıya alınan çiftliğin açık oturumları da iptal edilir; aksi halde refresh'e kadar çalışmaya devam ederdi. */
  setFarmStatus: superAdminProcedure
    .input(z.object({ farmId: z.string().uuid(), status: farmStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(farms)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(farms.id, input.farmId))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Çiftlik bulunamadı" });
      if (input.status === "suspended") {
        const farmUsers = ctx.db.select({ id: users.id }).from(users).where(eq(users.farmId, input.farmId));
        await ctx.db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(sql`${refreshTokens.userId} in ${farmUsers}`);
      }
      return updated;
    }),
});
