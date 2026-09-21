import { z } from "zod";

import {
  animalInputSchema,
  animalPatchSchema,
  breedInputSchema,
  breedingInputSchema,
  breedingPatchSchema,
  exitInputSchema,
  exitPatchSchema,
  observationInputSchema,
  observationPatchSchema,
  observationTagInputSchema,
  observationTagPatchSchema,
  attachmentInputSchema,
  attachmentPatchSchema,
  protocolInputSchema,
  protocolItemInputSchema,
  protocolItemPatchSchema,
  protocolPatchSchema,
  reminderInputSchema,
  reminderPatchSchema,
  lambingInputSchema,
  lambingPatchSchema,
  breedPatchSchema,
  groupInputSchema,
  groupMovementInputSchema,
  groupMovementPatchSchema,
  groupPatchSchema,
  healthInputSchema,
  healthPatchSchema,
  weightInputSchema,
  weightPatchSchema,
} from "./animals";
import {
  consumptionInputSchema,
  consumptionPatchSchema,
  expenseInputSchema,
  expensePatchSchema,
  incomeInputSchema,
  incomePatchSchema,
  purchaseInputSchema,
  purchasePatchSchema,
  stockItemInputSchema,
  stockItemPatchSchema,
} from "./stock";

/** Senkron edilen tablolar. Yeni tablo eklenince buraya ve sunucu kayıt defterine eklenir. */
export const syncedTables = [
  "breeds",
  "groups",
  "animals",
  "group_movements",
  "weight_records",
  "health_records",
  "breeding_records",
  "lambing_records",
  "exit_records",
  "observations",
  "observation_tags",
  "stock_items",
  "purchases",
  "consumptions",
  "expenses",
  "incomes",
  "reminders",
  "health_protocols",
  "protocol_items",
  "attachments",
] as const;
export type SyncedTable = (typeof syncedTables)[number];
export const syncedTableSchema = z.enum(syncedTables);

export const mutationOpSchema = z.enum(["insert", "update", "soft_delete"]);
export type MutationOp = z.infer<typeof mutationOpSchema>;

/** Tablo başına doğrulama şemaları: insert tam satır, update kısmi. */
export const tableSchemas = {
  breeds: { insert: breedInputSchema, update: breedPatchSchema },
  groups: { insert: groupInputSchema, update: groupPatchSchema },
  animals: { insert: animalInputSchema, update: animalPatchSchema },
  group_movements: { insert: groupMovementInputSchema, update: groupMovementPatchSchema },
  weight_records: { insert: weightInputSchema, update: weightPatchSchema },
  health_records: { insert: healthInputSchema, update: healthPatchSchema },
  breeding_records: { insert: breedingInputSchema, update: breedingPatchSchema },
  lambing_records: { insert: lambingInputSchema, update: lambingPatchSchema },
  exit_records: { insert: exitInputSchema, update: exitPatchSchema },
  observations: { insert: observationInputSchema, update: observationPatchSchema },
  observation_tags: { insert: observationTagInputSchema, update: observationTagPatchSchema },
  stock_items: { insert: stockItemInputSchema, update: stockItemPatchSchema },
  purchases: { insert: purchaseInputSchema, update: purchasePatchSchema },
  consumptions: { insert: consumptionInputSchema, update: consumptionPatchSchema },
  expenses: { insert: expenseInputSchema, update: expensePatchSchema },
  incomes: { insert: incomeInputSchema, update: incomePatchSchema },
  reminders: { insert: reminderInputSchema, update: reminderPatchSchema },
  health_protocols: { insert: protocolInputSchema, update: protocolPatchSchema },
  protocol_items: { insert: protocolItemInputSchema, update: protocolItemPatchSchema },
  attachments: { insert: attachmentInputSchema, update: attachmentPatchSchema },
} as const satisfies Record<SyncedTable, { insert: z.ZodTypeAny; update: z.ZodTypeAny }>;

export const softDeletePayloadSchema = z.object({
  reason: z.string().trim().max(200).nullable().optional(),
});

/** Outbox zarfı: istemcide üretilir, sunucuya olduğu gibi gider. */
export const mutationEnvelopeSchema = z.object({
  mutationId: z.string().uuid(),
  table: syncedTableSchema,
  op: mutationOpSchema,
  rowId: z.string().uuid(),
  /** insert: tam satır; update: değişen alanlar; soft_delete: { reason } */
  payload: z.record(z.string(), z.unknown()),
  /** Cihazda kaydın yazıldığı an. */
  clientCreatedAt: z.string().datetime({ offset: true }),
});
export type MutationEnvelope = z.infer<typeof mutationEnvelopeSchema>;

export const pushInputSchema = z.object({
  mutations: z.array(mutationEnvelopeSchema).min(1).max(200),
});

export const mutationResultSchema = z.discriminatedUnion("status", [
  z.object({ mutationId: z.string().uuid(), status: z.literal("applied") }),
  z.object({ mutationId: z.string().uuid(), status: z.literal("duplicate") }),
  z.object({
    mutationId: z.string().uuid(),
    status: z.literal("rejected"),
    code: z.enum(["VALIDATION", "CONFLICT", "NOT_FOUND", "FORBIDDEN", "RULE"]),
    message: z.string(),
  }),
]);
export type MutationResult = z.infer<typeof mutationResultSchema>;

export const pullInputSchema = z.object({
  /** Tablo başına son alınan sync_seq. Eksik tablo 0 sayılır. */
  cursors: z.record(z.string(), z.number().int().nonnegative()).default({}),
  limit: z.number().int().positive().max(1000).default(500),
});
