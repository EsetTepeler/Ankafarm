import { sql } from "drizzle-orm";
import { bigint, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { farms, users } from "./core";

/** Trigger ile dolar; app.user_id, app.device_id, app.mutation_id oturum ayarlarından okur. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    farmId: uuid().notNull(),
    tableName: text().notNull(),
    recordId: uuid().notNull(),
    action: text().notNull(),
    oldData: jsonb(),
    newData: jsonb(),
    userId: uuid(),
    deviceId: uuid(),
    mutationId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_farm_created_idx").on(t.farmId, t.createdAt),
    index("audit_log_record_idx").on(t.tableName, t.recordId),
  ],
);

/** Beklenen ile gerçekleşen. Bölüm 4.8. */
export const predictions = pgTable(
  "predictions",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    farmId: uuid()
      .notNull()
      .references(() => farms.id),
    animalId: uuid(),
    type: text().notNull(),
    predictedValue: numeric({ precision: 14, scale: 4, mode: "number" }),
    predictedPayload: jsonb(),
    confidence: numeric({ precision: 4, scale: 3, mode: "number" }),
    predictedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    targetDate: timestamp({ withTimezone: true, mode: "string" }),
    modelVersion: text().notNull(),
    source: text().notNull().default("rule"),
    actualValue: numeric({ precision: 14, scale: 4, mode: "number" }),
    actualSourceTable: text(),
    actualSourceId: uuid(),
    evaluatedAt: timestamp({ withTimezone: true }),
    error: numeric({ precision: 14, scale: 4, mode: "number" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("predictions_farm_animal_idx").on(t.farmId, t.animalId, t.type)],
);

/** Push ve ingest tekrarlarını yakalar; 90 günden eskiler temizlenir. */
export const appliedMutations = pgTable("applied_mutations", {
  mutationId: uuid().primaryKey(),
  farmId: uuid().notNull(),
  appliedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  userId: uuid().references(() => users.id),
  deviceId: uuid(),
});

/**
 * Bir satırın bir çiftlikten tamamen çıkması (transfer). Soft delete satırı çiftlikte bırakır;
 * burada ise satır artık o çiftliğin pull sorgusuna hiç girmediği için cihazdaki kopyayı
 * silmesini söyleyecek ayrı bir akış gerekiyor.
 */
export const syncRemovals = pgTable(
  "sync_removals",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    farmId: uuid()
      .notNull()
      .references(() => farms.id),
    tableName: text().notNull(),
    rowId: uuid().notNull(),
    syncSeq: bigint({ mode: "number" }).notNull().default(0),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sync_removals_farm_seq_idx").on(t.farmId, t.syncSeq),
    uniqueIndex("sync_removals_farm_row_uq").on(t.farmId, t.tableName, t.rowId),
  ],
);
