import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { animals } from "./animals";
import { farms, users } from "./core";

/**
 * İçgörüler (bölüm 4.7). Bu tabloya yalnızca Python servisi yazar; Node okur ve
 * "okundu"/"ertelendi" alanlarını günceller. Senkron edilmez: cihazda hesaplanmaz, sunucudan okunur.
 *
 * Tekillik: (farm_id, animal_id, type) için tek aktif kayıt. Yeniden hesapta upsert edilir;
 * koşul ortadan kalkınca satır silinmez, valid_until geçmişe çekilir (geçmiş kaybolmasın).
 */
export const insights = pgTable(
  "insights",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    farmId: uuid()
      .notNull()
      .references(() => farms.id),
    animalId: uuid().references(() => animals.id),
    type: text().notNull(),
    severity: text().notNull().default("info"),
    title: text().notNull(),
    message: text().notNull(),
    /** Hesapta kullanılan sayılar; arayüz grafik çizebilsin diye ayrıca saklanır. */
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp({ withTimezone: true }),
    acknowledgedAt: timestamp({ withTimezone: true }),
    acknowledgedBy: uuid().references(() => users.id),
    snoozedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Tekillik indeksi elle yazıldı (0022): çiftlik geneli bulgularda animal_id boş ve Postgres
    // varsayılanında iki NULL farklı sayılıyor; NULLS NOT DISTINCT olmadan kayıt her hesapta çoğalıyor.
    index("insights_farm_type_idx").on(t.farmId, t.type),
    index("insights_farm_valid_idx").on(t.farmId, t.validUntil),
  ],
);

export type Insight = typeof insights.$inferSelect;

/** Python tarafının yazdığı tahminler de aynı yerden okunur; tablo system.ts içinde tanımlı. */
export const insightSeverities = ["info", "warning", "critical"] as const;
export type InsightSeverity = (typeof insightSeverities)[number];
