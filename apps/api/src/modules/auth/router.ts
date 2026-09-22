import { loginInputSchema, refreshInputSchema, type UserRole } from "@anka/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { verifyPassword } from "../../auth/password";
import { assertNotLocked, farmLoginThrottle, recordFailure, recordSuccess } from "../../auth/throttle";
import { hashRefreshToken } from "../../auth/tokens";
import { farms, refreshTokens, users } from "../../db/schema";
import type { Context } from "../../trpc/context";
import { protectedProcedure, publicProcedure, router } from "../../trpc/init";

interface TokenUser {
  id: string;
  farmId: string;
  role: UserRole;
}

async function issueTokens(ctx: Context, user: TokenUser, device?: string) {
  const accessToken = await ctx.tokens.signAccessToken({ sub: user.id, farmId: user.farmId, role: user.role });
  const refresh = ctx.tokens.newRefreshToken();
  const expiresAt = new Date(Date.now() + ctx.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await ctx.db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt,
    device: device ?? null,
  });
  return {
    accessToken,
    refreshToken: refresh.token,
    accessExpiresInSeconds: ctx.env.ACCESS_TOKEN_TTL_MINUTES * 60,
  };
}

const publicUser = {
  id: users.id,
  farmId: users.farmId,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  phone: users.phone,
  active: users.active,
};

/** Askıya alınmış kiracının kullanıcısı ne giriş yapabilir ne de oturumunu tazeleyebilir (7.1). */
async function assertFarmActive(ctx: Context, farmId: string) {
  const [farm] = await ctx.db.select({ status: farms.status }).from(farms).where(eq(farms.id, farmId)).limit(1);
  if (farm?.status === "suspended") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Çiftlik hesabı askıya alınmış, yöneticiyle görüşün" });
  }
}

export const authRouter = router({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
    const keys = [`farm:${input.email}`, `farm-ip:${ctx.req.ip}`];
    for (const key of keys) assertNotLocked(key, farmLoginThrottle);

    const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const ok = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !ok) {
      const locked = keys.map((key) => recordFailure(key, farmLoginThrottle)).some(Boolean);
      ctx.req.log.warn({ email: input.email, ip: ctx.req.ip, locked }, "giriş başarısız");
      throw new TRPCError({ code: "UNAUTHORIZED", message: "E-posta veya şifre hatalı" });
    }
    for (const key of keys) recordSuccess(key);
    if (!user.active) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Hesap devre dışı" });
    }
    await assertFarmActive(ctx, user.farmId);
    await ctx.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const tokens = await issueTokens(ctx, user, input.device);
    const { passwordHash: _omit, ...safeUser } = user;
    return { ...tokens, user: safeUser };
  }),

  refresh: publicProcedure.input(refreshInputSchema).mutation(async ({ ctx, input }) => {
    const hash = hashRefreshToken(input.refreshToken);
    const [row] = await ctx.db
      .select({ token: refreshTokens, user: users })
      .from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
      .limit(1);
    if (!row || row.token.expiresAt < new Date() || !row.user.active) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Oturum süresi doldu, yeniden giriş yapın" });
    }
    await assertFarmActive(ctx, row.user.farmId);
    // Döndürme: eski token iptal edilir, yeni çift üretilir.
    await ctx.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.token.id));
    const tokens = await issueTokens(ctx, row.user, row.token.device ?? undefined);
    const { passwordHash: _omit, ...safeUser } = row.user;
    return { ...tokens, user: safeUser };
  }),

  logout: publicProcedure.input(refreshInputSchema).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(input.refreshToken)));
    return { ok: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ user: publicUser, farm: farms })
      .from(users)
      .innerJoin(farms, eq(farms.id, users.farmId))
      .where(eq(users.id, ctx.user.sub))
      .limit(1);
    if (!row) throw new TRPCError({ code: "UNAUTHORIZED", message: "Kullanıcı bulunamadı" });
    return row;
  }),
});
