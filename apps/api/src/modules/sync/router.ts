import { pullInputSchema, pushInputSchema } from "@anka/shared";

import { protectedProcedure, router } from "../../trpc/init";
import { pullChanges, pushMutations } from "./service";

export const syncRouter = router({
  push: protectedProcedure.input(pushInputSchema).mutation(async ({ ctx, input }) => {
    const results = await pushMutations(ctx.db, ctx.user, input.mutations);
    const applied = results.filter((r) => r.status === "applied");
    if (applied.length > 0) {
      const appliedIds = new Set(applied.map((r) => r.mutationId));
      const tables = [...new Set(input.mutations.filter((m) => appliedIds.has(m.mutationId)).map((m) => m.table))];
      // Batch başına tek olay (bölüm 9); istemciler biriktirip tek pull yapar.
      ctx.realtime?.emitChanged(ctx.user.farmId, tables, applied.length);
      ctx.req.log.info({ applied: applied.length, total: results.length, tables }, "sync.push uygulandı");
    }
    return { results, serverTime: new Date().toISOString() };
  }),

  pull: protectedProcedure.input(pullInputSchema).query(({ ctx, input }) => pullChanges(ctx.db, ctx.user, input.cursors, input.limit)),
});
