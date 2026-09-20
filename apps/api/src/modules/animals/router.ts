import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { animals, breeds, groups, healthRecords, predictions } from "../../db/schema";
import { protectedProcedure, router } from "../../trpc/init";

/**
 * Sadece okuma uçları: web raporları ve hızlı kontroller için.
 * Yazma her zaman sync.push üzerinden (bölüm 9).
 */
export const animalsRouter = router({
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).default({ includeInactive: false }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(animals)
        .where(
          and(
            eq(animals.farmId, ctx.user.farmId),
            isNull(animals.deletedAt),
            input.includeInactive ? undefined : eq(animals.status, "active"),
          ),
        )
        .orderBy(asc(animals.tagNo)),
    ),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(animals)
      .where(and(eq(animals.id, input.id), eq(animals.farmId, ctx.user.farmId)))
      .limit(1);
    return row ?? null;
  }),
});

export const healthRouter = router({
  list: protectedProcedure.input(z.object({ animalId: z.string().uuid().optional() })).query(({ ctx, input }) =>
    ctx.db
      .select()
      .from(healthRecords)
      .where(
        and(
          eq(healthRecords.farmId, ctx.user.farmId),
          isNull(healthRecords.deletedAt),
          input.animalId ? eq(healthRecords.animalId, input.animalId) : undefined,
        ),
      )
      .orderBy(asc(healthRecords.appliedAt)),
  ),
});

export const predictionsRouter = router({
  list: protectedProcedure.input(z.object({ animalId: z.string().uuid().optional() })).query(({ ctx, input }) =>
    ctx.db
      .select()
      .from(predictions)
      .where(and(eq(predictions.farmId, ctx.user.farmId), input.animalId ? eq(predictions.animalId, input.animalId) : undefined))
      .orderBy(asc(predictions.predictedAt)),
  ),
});

export const breedsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(breeds)
      .where(and(eq(breeds.farmId, ctx.user.farmId), isNull(breeds.deletedAt)))
      .orderBy(asc(breeds.species), asc(breeds.name)),
  ),
});

export const groupsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(groups)
      .where(and(eq(groups.farmId, ctx.user.farmId), isNull(groups.deletedAt)))
      .orderBy(asc(groups.name)),
  ),
});
