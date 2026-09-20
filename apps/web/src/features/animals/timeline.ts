import { buildTimeline, type AnimalEvent } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { alias } from "drizzle-orm/sqlite-core";
import { eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breedingRecords, exitRecords, groupMovements, groups, healthRecords, lambingRecords, observations, weightRecords } from "@/db/schema";

/**
 * Hayvanın bütün yaşamı tek listede. Paylaşılan eşleyiciler (packages/shared/events.ts) kullanılır;
 * sunucu aynı eşleyicilerle aynı şekli üretir. Anahtar "timeline": her yerel değişiklikte tazelenir.
 */
export function useTimeline(animalId: string | undefined) {
  return useQuery({
    queryKey: ["local", "timeline", animalId ?? ""],
    enabled: !!animalId,
    queryFn: async (): Promise<AnimalEvent[]> => {
      const db = getDb();
      const id = animalId!;
      const mother = alias(animals, "mother");
      const [row] = await db
        .select({ animal: animals, motherTagNo: mother.tagNo })
        .from(animals)
        .leftJoin(mother, eq(mother.id, animals.motherId))
        .where(eq(animals.id, id))
        .limit(1);
      if (!row) return [];
      const [weights, movements, health, breedings, lambings, exits, obs, groupRows] = await Promise.all([
        db.select().from(weightRecords).where(eq(weightRecords.animalId, id)),
        db.select().from(groupMovements).where(eq(groupMovements.animalId, id)),
        db.select().from(healthRecords).where(eq(healthRecords.animalId, id)),
        db.select().from(breedingRecords).where(or(eq(breedingRecords.femaleId, id), eq(breedingRecords.maleId, id))),
        db.select().from(lambingRecords).where(or(eq(lambingRecords.motherId, id), eq(lambingRecords.fatherId, id))),
        db.select().from(exitRecords).where(eq(exitRecords.animalId, id)),
        db.select().from(observations).where(eq(observations.animalId, id)),
        db.select({ id: groups.id, name: groups.name, kind: groups.kind }).from(groups),
      ]);
      const refIds = new Set<string>();
      for (const b of breedings) for (const x of [b.femaleId, b.maleId]) if (x) refIds.add(x);
      for (const l of lambings) for (const x of [l.motherId, l.fatherId]) if (x) refIds.add(x);
      const animalRefs = refIds.size
        ? await db.select({ id: animals.id, tagNo: animals.tagNo, name: animals.name }).from(animals).where(inArray(animals.id, [...refIds]))
        : [];
      return buildTimeline({
        animal: { ...row.animal, motherTagNo: row.motherTagNo },
        weights,
        movements,
        health,
        breedings,
        lambings,
        exits,
        observations: obs,
        animalRefs,
        groups: groupRows,
      });
    },
  });
}
