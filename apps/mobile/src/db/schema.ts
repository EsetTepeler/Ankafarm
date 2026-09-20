import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Sunucudaki senkron tabloların aynası. Alan adları birebir aynı (camelCase, snake_case sütun).
 * Tarihler ISO metin, sayısal alanlar real, boolean integer.
 * Sunucuda yeni tablo veya alan eklenince burası da güncellenir ve migration üretilir.
 */
const synced = {
  id: text().primaryKey(),
  farmId: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  createdBy: text(),
  syncSeq: integer().notNull().default(0),
  deletedAt: text(),
  deletedBy: text(),
  deleteReason: text(),
};

const event = {
  source: text().notNull().default("app"),
  deviceId: text(),
  recordedAt: text(),
};

export const breeds = sqliteTable(
  "breeds",
  {
    ...synced,
    name: text().notNull(),
    species: text().notNull(),
    isSeed: integer({ mode: "boolean" }).notNull().default(false),
    active: integer({ mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("breeds_species_idx").on(t.species, t.name)],
);

export const groups = sqliteTable("groups", {
  ...synced,
  name: text().notNull(),
  kind: text().notNull().default("pen"),
  capacity: integer(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const animals = sqliteTable(
  "animals",
  {
    ...synced,
    tagNo: text().notNull(),
    rfid: text(),
    name: text(),
    species: text().notNull(),
    breedId: text(),
    breedNote: text(),
    sex: text().notNull(),
    origin: text().notNull(),
    acquiredAt: text(),
    source: text(),
    purchasePrice: real(),
    birthDate: text(),
    birthDateEstimated: integer({ mode: "boolean" }).notNull().default(false),
    birthType: text(),
    birthId: text(),
    motherId: text(),
    fatherId: text(),
    status: text().notNull().default("active"),
    groupId: text(),
    photoPath: text(),
    notes: text(),
    currentWeight: real(),
    isPregnant: integer({ mode: "boolean" }).notNull().default(false),
    expectedBirthAt: text(),
  },
  (t) => [
    uniqueIndex("animals_tag_uq")
      .on(t.farmId, t.tagNo)
      .where(sql`${t.deletedAt} is null`),
    index("animals_status_idx").on(t.status),
    index("animals_group_idx").on(t.groupId),
    index("animals_mother_idx").on(t.motherId),
  ],
);

export const groupMovements = sqliteTable(
  "group_movements",
  {
    ...synced,
    ...event,
    animalId: text().notNull(),
    fromGroupId: text(),
    toGroupId: text().notNull(),
    movedAt: text().notNull(),
    reason: text(),
  },
  (t) => [index("group_movements_animal_idx").on(t.animalId, t.movedAt)],
);

export const weightRecords = sqliteTable(
  "weight_records",
  {
    ...synced,
    ...event,
    animalId: text().notNull(),
    weighedAt: text().notNull(),
    weightKg: real().notNull(),
    note: text(),
  },
  (t) => [index("weight_records_animal_idx").on(t.animalId, t.weighedAt)],
);

export const healthRecords = sqliteTable(
  "health_records",
  {
    ...synced,
    ...event,
    animalId: text().notNull(),
    type: text().notNull(),
    productName: text(),
    dose: real(),
    doseUnit: text(),
    appliedAt: text().notNull(),
    vetName: text(),
    nextDueAt: text(),
    withdrawalDays: integer(),
    withdrawalUntil: text(),
    cost: real(),
    batchId: text(),
    notes: text(),
  },
  (t) => [index("health_records_animal_idx").on(t.animalId, t.appliedAt), index("health_records_batch_idx").on(t.batchId)],
);

export const breedingRecords = sqliteTable(
  "breeding_records",
  {
    ...synced,
    ...event,
    femaleId: text().notNull(),
    maleId: text(),
    method: text().notNull().default("natural"),
    matedAt: text().notNull(),
    expectedBirthAt: text().notNull(),
    pregnancyCheckedAt: text(),
    pregnancyResult: text().notNull().default("pending"),
    notes: text(),
  },
  (t) => [index("breeding_records_female_idx").on(t.femaleId, t.matedAt), index("breeding_records_male_idx").on(t.maleId)],
);

export const lambingRecords = sqliteTable(
  "lambing_records",
  {
    ...synced,
    ...event,
    motherId: text().notNull(),
    fatherId: text(),
    breedingId: text(),
    bornAt: text().notNull(),
    difficulty: text().notNull().default("easy"),
    liveCount: integer().notNull().default(0),
    stillbornCount: integer().notNull().default(0),
    notes: text(),
  },
  (t) => [index("lambing_records_mother_idx").on(t.motherId, t.bornAt)],
);

/** Sunucuya gidecek yazmalar. Onaylanınca satır silinir, reddedilince failed kalır. */
export const outbox = sqliteTable(
  "outbox",
  {
    mutationId: text().primaryKey(),
    table: text().notNull(),
    op: text().notNull(),
    rowId: text().notNull(),
    payload: text({ mode: "json" }).notNull(),
    clientCreatedAt: text().notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    rejectionCode: text(),
  },
  (t) => [index("outbox_status_idx").on(t.status, t.clientCreatedAt)],
);

/** Tablo başına son alınan sync_seq. */
export const syncCursors = sqliteTable("sync_cursors", {
  table: text().primaryKey(),
  cursor: integer().notNull().default(0),
});

/** Küçük anahtar-değer: son senkron zamanı, çiftlik kimliği gibi. */
export const meta = sqliteTable("meta", {
  key: text().primaryKey(),
  value: text(),
});

export const localTables = { breeds, groups, animals, group_movements: groupMovements, weight_records: weightRecords, health_records: healthRecords, breeding_records: breedingRecords, lambing_records: lambingRecords } as const;
export type LocalTableName = keyof typeof localTables;

export type LocalBreed = typeof breeds.$inferSelect;
export type LocalGroup = typeof groups.$inferSelect;
export type LocalAnimal = typeof animals.$inferSelect;
export type LocalGroupMovement = typeof groupMovements.$inferSelect;
export type LocalWeightRecord = typeof weightRecords.$inferSelect;
export type LocalHealthRecord = typeof healthRecords.$inferSelect;
export type LocalBreedingRecord = typeof breedingRecords.$inferSelect;
export type LocalLambingRecord = typeof lambingRecords.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
