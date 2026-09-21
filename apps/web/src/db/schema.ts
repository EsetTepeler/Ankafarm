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

export const exitRecords = sqliteTable(
  "exit_records",
  {
    ...synced,
    ...event,
    animalId: text().notNull(),
    type: text().notNull(),
    exitedAt: text().notNull(),
    reason: text(),
    price: real(),
    buyer: text(),
    notes: text(),
  },
  (t) => [index("exit_records_animal_idx").on(t.animalId)],
);

export const observations = sqliteTable(
  "observations",
  {
    ...synced,
    ...event,
    animalId: text(),
    groupId: text(),
    observedAt: text().notNull(),
    category: text().notNull(),
    severity: text().notNull().default("normal"),
    tags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    note: text(),
    photoPath: text(),
  },
  (t) => [index("observations_animal_idx").on(t.animalId, t.observedAt), index("observations_observed_idx").on(t.observedAt)],
);

export const observationTags = sqliteTable(
  "observation_tags",
  {
    ...synced,
    category: text().notNull(),
    label: text().notNull(),
    isSeed: integer({ mode: "boolean" }).notNull().default(false),
    active: integer({ mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("observation_tags_category_idx").on(t.category)],
);

export const stockItems = sqliteTable(
  "stock_items",
  {
    ...synced,
    name: text().notNull(),
    category: text().notNull(),
    unit: text().notNull(),
    minStock: real(),
    trackStock: integer({ mode: "boolean" }).notNull().default(true),
    active: integer({ mode: "boolean" }).notNull().default(true),
    notes: text(),
  },
  (t) => [uniqueIndex("stock_items_name_uq").on(t.name)],
);

export const purchases = sqliteTable(
  "purchases",
  {
    ...synced,
    ...event,
    itemId: text().notNull(),
    purchasedAt: text().notNull(),
    quantity: real().notNull(),
    unitPrice: real(),
    total: real(),
    supplier: text(),
    documentPath: text(),
    notes: text(),
  },
  (t) => [index("purchases_item_idx").on(t.itemId, t.purchasedAt), index("purchases_date_idx").on(t.purchasedAt)],
);

export const consumptions = sqliteTable(
  "consumptions",
  {
    ...synced,
    ...event,
    itemId: text().notNull(),
    consumedOn: text().notNull(),
    quantity: real().notNull(),
    groupId: text(),
    animalId: text(),
    notes: text(),
  },
  (t) => [index("consumptions_item_idx").on(t.itemId, t.consumedOn), index("consumptions_date_idx").on(t.consumedOn)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    ...synced,
    category: text().notNull(),
    spentAt: text().notNull(),
    amount: real().notNull(),
    description: text(),
    animalId: text(),
    documentPath: text(),
  },
  (t) => [index("expenses_date_idx").on(t.spentAt)],
);

export const incomes = sqliteTable(
  "incomes",
  {
    ...synced,
    category: text().notNull(),
    receivedAt: text().notNull(),
    amount: real().notNull(),
    description: text(),
    animalId: text(),
  },
  (t) => [index("incomes_date_idx").on(t.receivedAt)],
);

export const reminders = sqliteTable(
  "reminders",
  {
    ...synced,
    title: text().notNull(),
    dueAt: text().notNull(),
    animalId: text(),
    groupId: text(),
    note: text(),
    doneAt: text(),
  },
  (t) => [index("reminders_due_idx").on(t.dueAt)],
);

export const healthProtocols = sqliteTable("health_protocols", {
  ...synced,
  name: text().notNull(),
  species: text().notNull(),
  active: integer({ mode: "boolean" }).notNull().default(true),
  notes: text(),
});

export const protocolItems = sqliteTable(
  "protocol_items",
  {
    ...synced,
    protocolId: text().notNull(),
    type: text().notNull(),
    productName: text(),
    trigger: text().notNull(),
    value: integer().notNull(),
    repeat: integer({ mode: "boolean" }).notNull().default(true),
    notes: text(),
  },
  (t) => [index("protocol_items_protocol_idx").on(t.protocolId)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    ...synced,
    entityTable: text().notNull(),
    entityId: text().notNull(),
    kind: text().notNull().default("photo"),
    mime: text().notNull(),
    size: integer().notNull(),
    caption: text(),
    storagePath: text(),
  },
  (t) => [index("attachments_entity_idx").on(t.entityTable, t.entityId)],
);

/** Yalnızca cihazda: yüklenmeyi bekleyen dosyanın kendisi. Base64, çünkü sqlite-proxy ikili veriyi taşımıyor. */
export const uploadQueue = sqliteTable(
  "upload_queue",
  {
    attachmentId: text().primaryKey(),
    mime: text().notNull(),
    data: text().notNull(),
    createdAt: text().notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [index("upload_queue_status_idx").on(t.status)],
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

export const localTables = {
  breeds,
  groups,
  animals,
  group_movements: groupMovements,
  weight_records: weightRecords,
  health_records: healthRecords,
  breeding_records: breedingRecords,
  lambing_records: lambingRecords,
  exit_records: exitRecords,
  observations,
  observation_tags: observationTags,
  stock_items: stockItems,
  purchases,
  consumptions,
  expenses,
  incomes,
  reminders,
  health_protocols: healthProtocols,
  protocol_items: protocolItems,
  attachments,
} as const;
export type LocalTableName = keyof typeof localTables;

export type LocalBreed = typeof breeds.$inferSelect;
export type LocalGroup = typeof groups.$inferSelect;
export type LocalAnimal = typeof animals.$inferSelect;
export type LocalGroupMovement = typeof groupMovements.$inferSelect;
export type LocalWeightRecord = typeof weightRecords.$inferSelect;
export type LocalHealthRecord = typeof healthRecords.$inferSelect;
export type LocalBreedingRecord = typeof breedingRecords.$inferSelect;
export type LocalLambingRecord = typeof lambingRecords.$inferSelect;
export type LocalExitRecord = typeof exitRecords.$inferSelect;
export type LocalObservation = typeof observations.$inferSelect;
export type LocalObservationTag = typeof observationTags.$inferSelect;
export type LocalStockItem = typeof stockItems.$inferSelect;
export type LocalPurchase = typeof purchases.$inferSelect;
export type LocalConsumption = typeof consumptions.$inferSelect;
export type LocalExpense = typeof expenses.$inferSelect;
export type LocalIncome = typeof incomes.$inferSelect;
export type LocalReminder = typeof reminders.$inferSelect;
export type LocalProtocol = typeof healthProtocols.$inferSelect;
export type LocalProtocolItem = typeof protocolItems.$inferSelect;
export type LocalAttachment = typeof attachments.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
