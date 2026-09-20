import { weightInputSchema } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, weightRecords } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey, notifyLocalChange } from "@/sync/events";
import { insertLocal, softDeleteLocal } from "@/sync/local";

export function useWeights(animalId: string | undefined) {
  return useQuery({
    queryKey: localKey("weight_records", animalId ?? ""),
    enabled: !!animalId,
    queryFn: () =>
      getDb()
        .select()
        .from(weightRecords)
        .where(and(eq(weightRecords.animalId, animalId!), isNull(weightRecords.deletedAt)))
        .orderBy(desc(weightRecords.weighedAt)),
  });
}

/**
 * animals.current_weight sunucuda trigger ile türer. Çevrimdışıyken de doğru görünsün diye
 * yerelde aynı hesabı yaparız; outbox'a girmez, pull gelince sunucu değeriyle örtüşür.
 */
async function refreshLocalCurrentWeight(animalId: string) {
  const db = getDb();
  const [latest] = await db
    .select({ kg: weightRecords.weightKg })
    .from(weightRecords)
    .where(and(eq(weightRecords.animalId, animalId), isNull(weightRecords.deletedAt)))
    .orderBy(desc(weightRecords.weighedAt), desc(weightRecords.createdAt))
    .limit(1);
  await db.update(animals).set({ currentWeight: latest?.kg ?? null }).where(eq(animals.id, animalId));
  notifyLocalChange(["animals"]);
}

export async function addWeight(input: { animalId: string; weightKg: number; weighedAt: string; note?: string | null }): Promise<string> {
  const parsed = weightInputSchema.parse({ id: newId(), ...input, note: input.note ?? null });
  const id = await insertLocal("weight_records", parsed);
  await refreshLocalCurrentWeight(input.animalId);
  return id;
}

export async function deleteWeight(id: string, animalId: string, reason?: string) {
  await softDeleteLocal("weight_records", id, reason);
  await refreshLocalCurrentWeight(animalId);
}
