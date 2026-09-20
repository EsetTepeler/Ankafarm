import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";

import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Oturum gerektirir. ctx.user artık null olamaz. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Oturum gerekli" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Sadece çiftlik sahibi. */
export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Bu işlem için sahip yetkisi gerekli" });
  }
  return next();
});
