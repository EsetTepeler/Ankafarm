import type { SyncedTable } from "@anka/shared";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";

import type { TokenService } from "../../auth/tokens";

export interface ChangedEvent {
  farmId: string;
  tables: SyncedTable[];
  count: number;
  at: string;
}

/**
 * Canlı yenileme (bölüm 3.2): her push veya ingest batch'i sonrası çiftlik odasına tek "changed" olayı.
 * İstemci olayları biriktirip tek pull yapar; olay satır başına değil, batch başına.
 */
export function createRealtime(app: FastifyInstance, tokens: TokenService, allowedOrigins: string[], isProduction: boolean) {
  const io = new Server(app.server, {
    path: "/socket.io",
    cors: {
      origin: (origin, cb) => {
        if (!origin || !isProduction || allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
    },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    const claims = token ? await tokens.verifyAccessToken(token) : null;
    if (!claims) return next(new Error("UNAUTHORIZED"));
    socket.data.farmId = claims.farmId;
    socket.data.userId = claims.sub;
    void socket.join(`farm:${claims.farmId}`);
    next();
  });

  io.on("connection", (socket) => {
    app.log.debug({ user: socket.data.userId }, "realtime bağlandı");
  });

  return {
    io,
    /** İçgörüler yenilendi; istemci listeyi tazeler. Senkron tablolarından ayrı bir olay. */
    emitInsights(farmId: string) {
      io.to(`farm:${farmId}`).emit("insights", { farmId, at: new Date().toISOString() });
    },
    emitChanged(farmId: string, tables: SyncedTable[], count: number) {
      const event: ChangedEvent = { farmId, tables, count, at: new Date().toISOString() };
      io.to(`farm:${farmId}`).emit("changed", event);
    },
    async close() {
      await io.close();
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
