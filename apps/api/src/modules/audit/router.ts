import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auditLog, users } from "../../db/schema";
import { ownerProcedure, router } from "../../trpc/init";

/**
 * Değişiklik geçmişi (bölüm 5, madde 3.9). Trigger'lar 1.1'den beri yazıyor; burası sadece okuma.
 * Sahip yetkisi ister: kayıtlar kimin neyi değiştirdiğini gösterir.
 */
export const auditRouter = router({
  list: ownerProcedure
    .input(
      z.object({
        recordId: z.string().uuid().optional(),
        tableName: z.string().max(40).optional(),
        /** Sayfalama: son satırın (createdAt, id) çifti. */
        cursor: z.object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() }).optional(),
        limit: z.number().int().positive().max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: auditLog.id,
          tableName: auditLog.tableName,
          recordId: auditLog.recordId,
          action: auditLog.action,
          oldData: auditLog.oldData,
          newData: auditLog.newData,
          createdAt: auditLog.createdAt,
          userId: auditLog.userId,
          userName: users.fullName,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .where(
          and(
            eq(auditLog.farmId, ctx.user.farmId),
            input.recordId ? eq(auditLog.recordId, input.recordId) : undefined,
            input.tableName ? eq(auditLog.tableName, input.tableName) : undefined,
            input.cursor
              ? or(
                  lt(auditLog.createdAt, new Date(input.cursor.createdAt)),
                  and(eq(auditLog.createdAt, new Date(input.cursor.createdAt)), lt(auditLog.id, input.cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page[page.length - 1];
      return {
        rows: page,
        nextCursor: hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
      };
    }),

  /** Hangi tablolarda kayıt var; ekrandaki filtre için. */
  tables: ownerProcedure.query(({ ctx }) =>
    ctx.db
      .select({ tableName: auditLog.tableName, n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(eq(auditLog.farmId, ctx.user.farmId))
      .groupBy(auditLog.tableName)
      .orderBy(auditLog.tableName),
  ),
});
