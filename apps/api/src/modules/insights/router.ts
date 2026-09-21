import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { animals, insights } from "../../db/schema";
import { protectedProcedure, router } from "../../trpc/init";

/** Geçerli içgörü: süresi dolmamış ve ertelenmemiş. */
const isActive = () => sql`(${insights.validUntil} is null or ${insights.validUntil} > now()) and (${insights.snoozedUntil} is null or ${insights.snoozedUntil} < now())`;

/**
 * İçgörüler (madde 5.2): Python servisi yazar, uygulama okur.
 * Yazma uçları yok; kullanıcı yalnızca "okundu" ve "ertele" işaretler.
 */
export const insightsRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.string().uuid().optional(), includeAcknowledged: z.boolean().default(false), limit: z.number().int().positive().max(200).default(50) }).default({ includeAcknowledged: false, limit: 50 }))
    .query(({ ctx, input }) =>
      ctx.db
        .select({
          id: insights.id,
          animalId: insights.animalId,
          tagNo: animals.tagNo,
          animalName: animals.name,
          type: insights.type,
          severity: insights.severity,
          title: insights.title,
          message: insights.message,
          data: insights.data,
          computedAt: insights.computedAt,
          acknowledgedAt: insights.acknowledgedAt,
          snoozedUntil: insights.snoozedUntil,
        })
        .from(insights)
        .leftJoin(animals, eq(animals.id, insights.animalId))
        .where(
          and(
            eq(insights.farmId, ctx.user.farmId),
            isActive(),
            input.animalId ? eq(insights.animalId, input.animalId) : undefined,
            input.includeAcknowledged ? undefined : isNull(insights.acknowledgedAt),
          ),
        )
        .orderBy(sql`case ${insights.severity} when 'critical' then 0 when 'warning' then 1 else 2 end`, desc(insights.computedAt))
        .limit(input.limit),
    ),

  acknowledge: protectedProcedure.input(z.object({ id: z.string().uuid(), undo: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .update(insights)
      .set({ acknowledgedAt: input.undo ? null : new Date(), acknowledgedBy: input.undo ? null : ctx.user.sub })
      .where(and(eq(insights.id, input.id), eq(insights.farmId, ctx.user.farmId)))
      .returning({ id: insights.id });
    return { ok: !!row };
  }),

  /** Ertele: belirtilen gün sayısı kadar listede görünmez. */
  snooze: protectedProcedure.input(z.object({ id: z.string().uuid(), days: z.number().int().positive().max(90).default(7) })).mutation(async ({ ctx, input }) => {
    const until = new Date(Date.now() + input.days * 86_400_000);
    const [row] = await ctx.db
      .update(insights)
      .set({ snoozedUntil: until })
      .where(and(eq(insights.id, input.id), eq(insights.farmId, ctx.user.farmId)))
      .returning({ id: insights.id });
    return { ok: !!row, until: until.toISOString() };
  }),
});
