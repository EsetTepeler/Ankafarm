import { breedingInputSchema, DEFAULT_GESTATION_DAYS, expectedBirthDate, type BreedingMethod, type PregnancyResult, type Species } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breedingRecords, lambingRecords } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey, notifyLocalChange } from "@/sync/events";
import { insertManyLocal, softDeleteManyLocal, updateLocal } from "@/sync/local";

export function useBreedings(animalId: string | undefined) {
  return useQuery({
    queryKey: localKey("breeding_records", animalId ?? ""),
    enabled: !!animalId,
    queryFn: () =>
      getDb()
        .select()
        .from(breedingRecords)
        .where(and(isNull(breedingRecords.deletedAt), or(eq(breedingRecords.femaleId, animalId!), eq(breedingRecords.maleId, animalId!))))
        .orderBy(desc(breedingRecords.matedAt)),
  });
}

/**
 * animals.is_pregnant ve expected_birth_at sunucuda trigger ile türer; çevrimdışı için yerelde aynı kural:
 * sonrasında doğum olmayan, olumsuz çıkmamış son çiftleşme varsa gebe.
 */
export async function refreshLocalPregnancy(femaleId: string) {
  const db = getDb();
  const rows = await db
    .select({ matedAt: breedingRecords.matedAt, expectedBirthAt: breedingRecords.expectedBirthAt, result: breedingRecords.pregnancyResult })
    .from(breedingRecords)
    .where(and(eq(breedingRecords.femaleId, femaleId), isNull(breedingRecords.deletedAt)))
    .orderBy(desc(breedingRecords.matedAt));
  let pregnant = false;
  let expected: string | null = null;
  for (const b of rows) {
    if (b.result === "negative") continue;
    const [birthAfter] = await db
      .select({ id: lambingRecords.id })
      .from(lambingRecords)
      .where(and(eq(lambingRecords.motherId, femaleId), isNull(lambingRecords.deletedAt), gte(lambingRecords.bornAt, b.matedAt)))
      .limit(1);
    if (!birthAfter) {
      pregnant = true;
      expected = b.expectedBirthAt;
    }
    break; // sadece son çiftleşme belirleyici
  }
  await db.update(animals).set({ isPregnant: pregnant, expectedBirthAt: expected }).where(eq(animals.id, femaleId));
  notifyLocalChange(["animals"]);
}

export async function addBreeding(input: { femaleId: string; maleId: string | null; method: BreedingMethod; matedAt: string; notes?: string | null; species: Species }): Promise<string> {
  const expectedBirthAt = expectedBirthDate(input.matedAt, DEFAULT_GESTATION_DAYS[input.species]);
  const parsed = breedingInputSchema.parse({
    id: newId(),
    femaleId: input.femaleId,
    maleId: input.maleId,
    method: input.method,
    matedAt: input.matedAt,
    expectedBirthAt,
    pregnancyResult: "pending",
    notes: input.notes ?? null,
  });
  const [id] = await insertManyLocal("breeding_records", [parsed]);
  await refreshLocalPregnancy(input.femaleId);
  return id!;
}

export async function setPregnancyResult(id: string, femaleId: string, result: PregnancyResult, checkedAt: string) {
  await updateLocal("breeding_records", id, { pregnancyResult: result, pregnancyCheckedAt: checkedAt });
  await refreshLocalPregnancy(femaleId);
}

export async function deleteBreeding(id: string, femaleId: string, reason?: string) {
  await softDeleteManyLocal("breeding_records", [id], reason);
  await refreshLocalPregnancy(femaleId);
}

export interface BreedingSummary {
  births: number;
  liveLambs: number;
  stillborn: number;
  /** Erkek için babası olduğu yavru sayısı. */
  sired: number;
}

/** Çiftleşme formundaki geçmiş performans kartı; sunucudaki fn_breeding_summary ile aynı sayılar. */
export async function breedingSummary(animalId: string): Promise<BreedingSummary> {
  const db = getDb();
  const births = await db
    .select({ live: lambingRecords.liveCount, still: lambingRecords.stillbornCount })
    .from(lambingRecords)
    .where(and(eq(lambingRecords.motherId, animalId), isNull(lambingRecords.deletedAt)));
  const sired = await db
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.fatherId, animalId), isNull(animals.deletedAt)));
  return {
    births: births.length,
    liveLambs: births.reduce((s, b) => s + b.live, 0),
    stillborn: births.reduce((s, b) => s + b.still, 0),
    sired: sired.length,
  };
}
