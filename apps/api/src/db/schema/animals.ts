import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

import { eventColumns, syncedColumns } from "./synced";

export const speciesEnum = pgEnum("species", ["sheep", "goat"]);
export const sexEnum = pgEnum("sex", ["female", "male", "castrated"]);
export const originEnum = pgEnum("origin", ["born_here", "purchased"]);
export const animalStatusEnum = pgEnum("animal_status", ["active", "sold", "dead", "slaughtered", "lost"]);
export const birthTypeEnum = pgEnum("birth_type", ["single", "twin", "triplet", "quad"]);
export const groupKindEnum = pgEnum("group_kind", ["pen", "pasture", "quarantine", "nursery"]);
export const breedingMethodEnum = pgEnum("breeding_method", ["natural", "ai"]);
export const pregnancyResultEnum = pgEnum("pregnancy_result", ["pending", "positive", "negative"]);
export const birthDifficultyEnum = pgEnum("birth_difficulty", ["easy", "assisted", "hard", "cesarean"]);
export const exitTypeEnum = pgEnum("exit_type", ["sold", "died", "slaughtered", "lost"]);
export const observationCategoryEnum = pgEnum("observation_category", ["feeding", "movement", "behavior", "respiratory", "digestive", "appearance", "udder", "reproductive", "note", "other"]);
export const severityEnum = pgEnum("severity", ["normal", "mild", "moderate", "severe"]);
export const healthTypeEnum = pgEnum("health_type", ["vaccine", "medication", "deworming", "disease", "exam", "hoof", "shearing", "other"]);

export const breeds = pgTable(
  "breeds",
  {
    ...syncedColumns,
    name: text().notNull(),
    species: speciesEnum().notNull(),
    isSeed: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
  },
  (t) => [
    uniqueIndex("breeds_farm_species_name_uq").on(t.farmId, t.species, t.name),
    index("breeds_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const groups = pgTable(
  "groups",
  {
    ...syncedColumns,
    name: text().notNull(),
    kind: groupKindEnum().notNull().default("pen"),
    capacity: integer(),
    active: boolean().notNull().default(true),
  },
  (t) => [index("groups_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export const animals = pgTable(
  "animals",
  {
    ...syncedColumns,
    // Kimlik
    tagNo: text().notNull(),
    rfid: text(),
    name: text(),
    species: speciesEnum().notNull(),
    breedId: uuid().references(() => breeds.id),
    breedNote: text(),
    sex: sexEnum().notNull(),
    // Köken
    origin: originEnum().notNull(),
    acquiredAt: date({ mode: "string" }),
    source: text(),
    purchasePrice: numeric({ precision: 12, scale: 2, mode: "number" }),
    // Doğum
    birthDate: date({ mode: "string" }),
    birthDateEstimated: boolean().notNull().default(false),
    birthType: birthTypeEnum(),
    birthId: uuid(),
    motherId: uuid().references((): AnyPgColumn => animals.id),
    fatherId: uuid().references((): AnyPgColumn => animals.id),
    // Durum
    status: animalStatusEnum().notNull().default("active"),
    groupId: uuid().references(() => groups.id),
    photoPath: text(),
    notes: text(),
    // Türev, trigger ve servislerle güncellenir
    currentWeight: numeric({ precision: 6, scale: 2, mode: "number" }),
    isPregnant: boolean().notNull().default(false),
    expectedBirthAt: date({ mode: "string" }),
  },
  (t) => [
    uniqueIndex("animals_farm_tag_uq")
      .on(t.farmId, t.tagNo)
      .where(sql`${t.deletedAt} is null`),
    index("animals_farm_status_idx").on(t.farmId, t.status),
    index("animals_farm_sync_idx").on(t.farmId, t.syncSeq),
    index("animals_mother_idx").on(t.motherId),
    index("animals_father_idx").on(t.fatherId),
  ],
);

export const groupMovements = pgTable(
  "group_movements",
  {
    ...syncedColumns,
    ...eventColumns,
    animalId: uuid()
      .notNull()
      .references(() => animals.id),
    fromGroupId: uuid().references(() => groups.id),
    toGroupId: uuid()
      .notNull()
      .references(() => groups.id),
    movedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    reason: text(),
  },
  (t) => [
    index("group_movements_animal_idx").on(t.animalId, t.movedAt),
    index("group_movements_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const weightRecords = pgTable(
  "weight_records",
  {
    ...syncedColumns,
    ...eventColumns,
    animalId: uuid()
      .notNull()
      .references(() => animals.id),
    weighedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    weightKg: numeric({ precision: 6, scale: 2, mode: "number" }).notNull(),
    note: text(),
  },
  (t) => [
    index("weight_records_animal_idx").on(t.animalId, t.weighedAt),
    index("weight_records_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const healthRecords = pgTable(
  "health_records",
  {
    ...syncedColumns,
    ...eventColumns,
    animalId: uuid()
      .notNull()
      .references(() => animals.id),
    type: healthTypeEnum().notNull(),
    productName: text(),
    dose: numeric({ precision: 10, scale: 3, mode: "number" }),
    doseUnit: text(),
    appliedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    vetName: text(),
    nextDueAt: date({ mode: "string" }),
    withdrawalDays: integer(),
    /** Trigger ile: applied_at + withdrawal_days. */
    withdrawalUntil: date({ mode: "string" }),
    cost: numeric({ precision: 12, scale: 2, mode: "number" }),
    batchId: uuid(),
    notes: text(),
  },
  (t) => [
    index("health_records_animal_idx").on(t.animalId, t.appliedAt),
    index("health_records_batch_idx").on(t.batchId),
    index("health_records_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const breedingRecords = pgTable(
  "breeding_records",
  {
    ...syncedColumns,
    ...eventColumns,
    femaleId: uuid()
      .notNull()
      .references(() => animals.id),
    maleId: uuid().references(() => animals.id),
    method: breedingMethodEnum().notNull().default("natural"),
    matedAt: date({ mode: "string" }).notNull(),
    expectedBirthAt: date({ mode: "string" }).notNull(),
    pregnancyCheckedAt: date({ mode: "string" }),
    pregnancyResult: pregnancyResultEnum().notNull().default("pending"),
    notes: text(),
  },
  (t) => [
    index("breeding_records_female_idx").on(t.femaleId, t.matedAt),
    index("breeding_records_male_idx").on(t.maleId),
    index("breeding_records_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const lambingRecords = pgTable(
  "lambing_records",
  {
    ...syncedColumns,
    ...eventColumns,
    motherId: uuid()
      .notNull()
      .references(() => animals.id),
    fatherId: uuid().references(() => animals.id),
    breedingId: uuid().references(() => breedingRecords.id),
    bornAt: date({ mode: "string" }).notNull(),
    difficulty: birthDifficultyEnum().notNull().default("easy"),
    liveCount: integer().notNull().default(0),
    stillbornCount: integer().notNull().default(0),
    notes: text(),
  },
  (t) => [
    index("lambing_records_mother_idx").on(t.motherId, t.bornAt),
    index("lambing_records_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const exitRecords = pgTable(
  "exit_records",
  {
    ...syncedColumns,
    ...eventColumns,
    animalId: uuid()
      .notNull()
      .references(() => animals.id),
    type: exitTypeEnum().notNull(),
    exitedAt: date({ mode: "string" }).notNull(),
    reason: text(),
    price: numeric({ precision: 12, scale: 2, mode: "number" }),
    buyer: text(),
    notes: text(),
  },
  (t) => [index("exit_records_animal_idx").on(t.animalId), index("exit_records_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export const observations = pgTable(
  "observations",
  {
    ...syncedColumns,
    ...eventColumns,
    animalId: uuid().references(() => animals.id),
    groupId: uuid().references(() => groups.id),
    observedAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    category: observationCategoryEnum().notNull(),
    severity: severityEnum().notNull().default("normal"),
    tags: jsonb().$type<string[]>().notNull().default([]),
    note: text(),
    photoPath: text(),
  },
  (t) => [
    index("observations_animal_idx").on(t.animalId, t.observedAt),
    index("observations_farm_observed_idx").on(t.farmId, t.observedAt),
    index("observations_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

export const observationTags = pgTable(
  "observation_tags",
  {
    ...syncedColumns,
    category: observationCategoryEnum().notNull(),
    label: text().notNull(),
    isSeed: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex("observation_tags_farm_cat_label_uq").on(t.farmId, t.category, t.label), index("observation_tags_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

/** Elle girilen hatırlatıcı; türev işler (geciken doz, gebelik kontrolü) kayıtlardan hesaplanır, burada durmaz. */
export const reminders = pgTable(
  "reminders",
  {
    ...syncedColumns,
    title: text().notNull(),
    dueAt: date({ mode: "string" }).notNull(),
    animalId: uuid().references(() => animals.id),
    groupId: uuid().references(() => groups.id),
    note: text(),
    doneAt: timestamp({ withTimezone: true, mode: "string" }),
  },
  (t) => [index("reminders_farm_due_idx").on(t.farmId, t.dueAt), index("reminders_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export const protocolTriggerEnum = pgEnum("protocol_trigger", ["age_days", "interval_days", "fixed_month"]);

/** Çiftliğin yıllık aşı ve bakım programı; hatırlatıcılar buradan türetilir, kayıt üretmez. */
export const healthProtocols = pgTable(
  "health_protocols",
  {
    ...syncedColumns,
    name: text().notNull(),
    species: speciesEnum().notNull(),
    active: boolean().notNull().default(true),
    notes: text(),
  },
  (t) => [index("health_protocols_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export const protocolItems = pgTable(
  "protocol_items",
  {
    ...syncedColumns,
    protocolId: uuid()
      .notNull()
      .references(() => healthProtocols.id),
    type: healthTypeEnum().notNull(),
    productName: text(),
    trigger: protocolTriggerEnum().notNull(),
    value: integer().notNull(),
    repeat: boolean().notNull().default(true),
    notes: text(),
  },
  (t) => [index("protocol_items_protocol_idx").on(t.protocolId), index("protocol_items_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

/** Ek dosya künyesi; ikili veri sunucudaki uploads biriminde, yol storage_path alanında. */
export const attachments = pgTable(
  "attachments",
  {
    ...syncedColumns,
    entityTable: text().notNull(),
    entityId: uuid().notNull(),
    kind: text().notNull().default("photo"),
    mime: text().notNull(),
    size: integer().notNull(),
    caption: text(),
    storagePath: text(),
  },
  (t) => [index("attachments_entity_idx").on(t.entityTable, t.entityId), index("attachments_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export type Breed = typeof breeds.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Animal = typeof animals.$inferSelect;
export type GroupMovement = typeof groupMovements.$inferSelect;
export type WeightRecord = typeof weightRecords.$inferSelect;
export type HealthRecord = typeof healthRecords.$inferSelect;
export type BreedingRecord = typeof breedingRecords.$inferSelect;
export type LambingRecord = typeof lambingRecords.$inferSelect;
export type ExitRecord = typeof exitRecords.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type HealthProtocol = typeof healthProtocols.$inferSelect;
export type ProtocolItem = typeof protocolItems.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Observation = typeof observations.$inferSelect;
export type ObservationTag = typeof observationTags.$inferSelect;
