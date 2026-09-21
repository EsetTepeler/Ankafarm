import { updateFarmInputSchema } from "@anka/shared";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { farms } from "../../db/schema";
import { ownerProcedure, protectedProcedure, router } from "../../trpc/init";

export const farmRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [farm] = await ctx.db.select().from(farms).where(eq(farms.id, ctx.user.farmId)).limit(1);
    if (!farm) throw new TRPCError({ code: "NOT_FOUND", message: "Çiftlik bulunamadı" });
    return farm;
  }),

  update: ownerProcedure.input(updateFarmInputSchema).mutation(async ({ ctx, input }) => {
    const { insights, ...columns } = input;
    // Eşikler ayrı bir sütun değil, settings jsonb alanının içinde; mevcut ayarlarla birleştirilir.
    let settings: Record<string, unknown> | undefined;
    if (insights) {
      const [current] = await ctx.db.select({ settings: farms.settings }).from(farms).where(eq(farms.id, ctx.user.farmId)).limit(1);
      settings = { ...((current?.settings as Record<string, unknown>) ?? {}), insights };
    }
    const [updated] = await ctx.db
      .update(farms)
      .set({ ...columns, ...(settings ? { settings } : {}), updatedAt: new Date() })
      .where(eq(farms.id, ctx.user.farmId))
      .returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Çiftlik bulunamadı" });
    return updated;
  }),
});
