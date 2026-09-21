import type { FastifyBaseLogger } from "fastify";
import { Client } from "pg";

import type { Realtime } from "../realtime";

/**
 * Python servisi bulguları yazınca `NOTIFY insights_changed` gönderir; burada dinlenip
 * istemcilere canlı haber verilir (bölüm 3.5). Kendi bağlantısını kullanır: havuzdaki
 * bağlantı LISTEN için ayrılamaz.
 */
export function startInsightsListener(databaseUrl: string, realtime: Realtime | null, log: FastifyBaseLogger) {
  let client: Client | null = null;
  let stopped = false;
  let retry: NodeJS.Timeout | null = null;

  const connect = async () => {
    if (stopped) return;
    client = new Client({ connectionString: databaseUrl });
    client.on("notification", (msg) => {
      const farmId = msg.payload;
      if (!farmId) return;
      log.debug({ farmId }, "içgörüler güncellendi");
      realtime?.emitInsights(farmId);
    });
    client.on("error", (err) => {
      log.warn({ err: String(err) }, "içgörü dinleyicisi koptu, yeniden bağlanılacak");
      schedule();
    });
    await client.connect();
    await client.query("listen insights_changed");
    log.info("içgörü dinleyicisi hazır");
  };

  const schedule = () => {
    if (stopped || retry) return;
    retry = setTimeout(() => {
      retry = null;
      void connect().catch((err) => {
        log.warn({ err: String(err) }, "içgörü dinleyicisi bağlanamadı");
        schedule();
      });
    }, 5_000);
  };

  void connect().catch((err) => {
    log.warn({ err: String(err) }, "içgörü dinleyicisi bağlanamadı");
    schedule();
  });

  return {
    async close() {
      stopped = true;
      if (retry) clearTimeout(retry);
      await client?.end().catch(() => undefined);
    },
  };
}
