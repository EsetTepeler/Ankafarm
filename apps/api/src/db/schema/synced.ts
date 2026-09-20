import { sql } from "drizzle-orm";
import { bigint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { farms, users } from "./core";

/**
 * Senkron edilen her tabloda bulunan alanlar.
 * - id istemcide üretilir (UUIDv7), sunucu tarafı eklemelerde uuidv7() varsayılanı.
 * - sync_seq trigger ile her yazmada global sequence'ten yenilenir; pull imleci.
 * - Fiziksel silme yok: deleted_at dolu satır "silinmiş" sayılır ve pull ile istemciye de gider.
 */
export const syncedColumns = {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  farmId: uuid()
    .notNull()
    .references(() => farms.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid().references(() => users.id),
  syncSeq: bigint({ mode: "number" }).notNull().default(0),
  deletedAt: timestamp({ withTimezone: true }),
  deletedBy: uuid().references(() => users.id),
  deleteReason: text(),
};

/** Olay tablolarına ek: kaynak ve cihazda kayıt anı. */
export const eventColumns = {
  source: text().notNull().default("app"),
  deviceId: uuid(),
  recordedAt: timestamp({ withTimezone: true, mode: "string" }),
};
