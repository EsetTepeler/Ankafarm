import { tableSchemas, type SyncedTable, type UserRole } from "@anka/shared";

import {
  animals,
  breedingRecords,
  breeds,
  consumptions,
  exitRecords,
  expenses,
  groupMovements,
  groups,
  healthProtocols,
  healthRecords,
  incomes,
  lambingRecords,
  observationTags,
  observations,
  protocolItems,
  purchases,
  reminders,
  stockItems,
  weightRecords,
} from "../../db/schema";

/**
 * Senkron edilen tabloların sunucu tarafı kaydı.
 * Yeni tablo: packages/shared/sync.ts içindeki syncedTables ve tableSchemas ile birlikte buraya eklenir.
 */
export const syncRegistry = {
  breeds: { table: breeds, schemas: tableSchemas.breeds, writers: ["owner", "worker"] as UserRole[] },
  groups: { table: groups, schemas: tableSchemas.groups, writers: ["owner", "worker"] as UserRole[] },
  animals: { table: animals, schemas: tableSchemas.animals, writers: ["owner", "worker"] as UserRole[] },
  group_movements: { table: groupMovements, schemas: tableSchemas.group_movements, writers: ["owner", "worker"] as UserRole[] },
  weight_records: { table: weightRecords, schemas: tableSchemas.weight_records, writers: ["owner", "worker"] as UserRole[] },
  health_records: { table: healthRecords, schemas: tableSchemas.health_records, writers: ["owner", "worker", "vet"] as UserRole[] },
  breeding_records: { table: breedingRecords, schemas: tableSchemas.breeding_records, writers: ["owner", "worker"] as UserRole[] },
  lambing_records: { table: lambingRecords, schemas: tableSchemas.lambing_records, writers: ["owner", "worker"] as UserRole[] },
  exit_records: { table: exitRecords, schemas: tableSchemas.exit_records, writers: ["owner", "worker"] as UserRole[] },
  observations: { table: observations, schemas: tableSchemas.observations, writers: ["owner", "worker", "vet"] as UserRole[] },
  observation_tags: { table: observationTags, schemas: tableSchemas.observation_tags, writers: ["owner", "worker", "vet"] as UserRole[] },
  stock_items: { table: stockItems, schemas: tableSchemas.stock_items, writers: ["owner", "worker"] as UserRole[] },
  purchases: { table: purchases, schemas: tableSchemas.purchases, writers: ["owner"] as UserRole[] },
  consumptions: { table: consumptions, schemas: tableSchemas.consumptions, writers: ["owner", "worker"] as UserRole[] },
  expenses: { table: expenses, schemas: tableSchemas.expenses, writers: ["owner"] as UserRole[] },
  incomes: { table: incomes, schemas: tableSchemas.incomes, writers: ["owner"] as UserRole[] },
  reminders: { table: reminders, schemas: tableSchemas.reminders, writers: ["owner", "worker", "vet"] as UserRole[] },
  health_protocols: { table: healthProtocols, schemas: tableSchemas.health_protocols, writers: ["owner", "vet"] as UserRole[] },
  protocol_items: { table: protocolItems, schemas: tableSchemas.protocol_items, writers: ["owner", "vet"] as UserRole[] },
} as const satisfies Record<SyncedTable, unknown>;

/** Soft delete yalnızca sahibe açık (bölüm 4.6). */
export const deleteRoles: UserRole[] = ["owner"];
