import type { AccessTokenClaims, SyncedTable } from "@anka/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "../../db/client";
import { predictions } from "../../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Hook = (tx: Tx, user: AccessTokenClaims, rowId: string, fields: Record<string, unknown>) => Promise<void>;

const DAY_MS = 86_400_000;

/**
 * Ekleme sonrası türev işler. Beklenen ile gerçekleşen ayrı tutulur (bölüm 4.8):
 * çiftleşme bir doğum tarihi tahmini üretir, doğum kaydı o tahmini değerlendirir.
 */
export const afterInsertHooks: Partial<Record<SyncedTable, Hook>> = {
  async breeding_records(tx, user, rowId, fields) {
    const expected = fields.expectedBirthAt as string;
    await tx.insert(predictions).values({
      farmId: user.farmId,
      animalId: fields.femaleId as string,
      type: "birth_date",
      predictedPayload: { date: expected, breedingId: rowId, matedAt: fields.matedAt },
      targetDate: `${expected}T00:00:00.000Z`,
      modelVersion: "gestation-rule-v1",
      source: "rule",
    });
  },

  async lambing_records(tx, _user, rowId, fields) {
    const motherId = fields.motherId as string;
    const bornAt = fields.bornAt as string;
    const breedingId = (fields.breedingId as string | null | undefined) ?? null;
    // Önce çiftleşmeye bağlı tahmin, yoksa annenin değerlendirilmemiş son doğum tahmini.
    const [row] = await tx
      .select({ id: predictions.id, targetDate: predictions.targetDate })
      .from(predictions)
      .where(
        and(
          eq(predictions.animalId, motherId),
          eq(predictions.type, "birth_date"),
          isNull(predictions.evaluatedAt),
          breedingId ? sql`${predictions.predictedPayload} ->> 'breedingId' = ${breedingId}` : undefined,
        ),
      )
      .orderBy(desc(predictions.predictedAt))
      .limit(1);
    if (!row || !row.targetDate) return;
    const errorDays = Math.round((Date.parse(`${bornAt}T00:00:00.000Z`) - Date.parse(row.targetDate)) / DAY_MS);
    await tx
      .update(predictions)
      .set({
        actualValue: errorDays,
        actualSourceTable: "lambing_records",
        actualSourceId: rowId,
        evaluatedAt: new Date(),
        error: errorDays,
        updatedAt: new Date(),
      })
      .where(eq(predictions.id, row.id));
  },
};
