import type { AccessTokenClaims } from "@anka/shared";
import { createUserInputSchema, setUserPasswordInputSchema, updateUserInputSchema } from "@anka/shared";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { hashPassword } from "../../auth/password";
import { refreshTokens, users } from "../../db/schema";
import type { Context } from "../../trpc/context";
import { ownerProcedure, protectedProcedure, router } from "../../trpc/init";

const publicUser = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  phone: users.phone,
  active: users.active,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

/**
 * Çiftlik sahipsiz kalmasın: son aktif sahibi kapatmak ya da rolünü düşürmek engellenir.
 * Aksi halde kullanıcı yönetimine kimse erişemez ve kilit ancak veritabanından açılır.
 */
async function assertNotLastOwner(ctx: Context & { user: AccessTokenClaims }, userId: string) {
  const [target] = await ctx.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (target?.role !== "owner") return;
  const [remaining] = await ctx.db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.farmId, ctx.user.farmId), eq(users.role, "owner"), eq(users.active, true), ne(users.id, userId)));
  if ((remaining?.value ?? 0) === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Çiftlikte en az bir aktif sahip kalmalı" });
}

export const usersRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select(publicUser).from(users).where(eq(users.farmId, ctx.user.farmId)).orderBy(asc(users.createdAt)),
  ),

  /** Sahip yeni kullanıcı açar; e-posta gönderimi yok, şifreyi elden verir. */
  create: ownerProcedure.input(createUserInputSchema).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Bu e-posta zaten kayıtlı" });
    const [created] = await ctx.db
      .insert(users)
      .values({
        farmId: ctx.user.farmId,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        fullName: input.fullName,
        role: input.role,
        phone: input.phone ?? null,
      })
      .returning(publicUser);
    return created;
  }),

  /** Ad, rol ve telefon. E-posta giriş kimliği olduğu için buradan değişmez. */
  update: ownerProcedure.input(updateUserInputSchema).mutation(async ({ ctx, input }) => {
    if (input.role && input.userId === ctx.user.sub) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Kendi rolünüzü değiştiremezsiniz" });
    }
    if (input.role && input.role !== "owner") await assertNotLastOwner(ctx, input.userId);
    const [updated] = await ctx.db
      .update(users)
      .set({
        ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, input.userId), eq(users.farmId, ctx.user.farmId)))
      .returning(publicUser);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı bulunamadı" });
    return updated;
  }),

  /** Şifreyi sahip belirler ve elden verir; o kullanıcının açık oturumları kapanır. */
  setPassword: ownerProcedure.input(setUserPasswordInputSchema).mutation(async ({ ctx, input }) => {
    const [target] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.farmId, ctx.user.farmId)))
      .limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı bulunamadı" });
    await ctx.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), updatedAt: new Date() })
      .where(eq(users.id, input.userId));
    await ctx.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, input.userId));
    return { ok: true };
  }),

  setActive: ownerProcedure
    .input(z.object({ userId: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.sub && !input.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kendi hesabınızı kapatamazsınız" });
      }
      if (!input.active) await assertNotLastOwner(ctx, input.userId);
      const [updated] = await ctx.db
        .update(users)
        .set({ active: input.active, updatedAt: new Date() })
        .where(and(eq(users.id, input.userId), eq(users.farmId, ctx.user.farmId)))
        .returning(publicUser);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı bulunamadı" });
      if (!input.active) {
        await ctx.db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.userId, input.userId));
      }
      return updated;
    }),
});
