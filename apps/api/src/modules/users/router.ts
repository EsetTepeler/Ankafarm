import { createUserInputSchema } from "@anka/shared";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { hashPassword } from "../../auth/password";
import { refreshTokens, users } from "../../db/schema";
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

  setActive: ownerProcedure
    .input(z.object({ userId: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.sub && !input.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kendi hesabınızı kapatamazsınız" });
      }
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
