import { useQuery } from "@tanstack/react-query";
import { and, asc, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, healthRecords, weightRecords } from "@/db/schema";
import { todayIso } from "@/utils/date";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bugün ekranının sayıları; tamamı yerel veritabanından. */
export function useDashboard() {
  return useQuery({
    queryKey: ["local", "animals", "dashboard"],
    queryFn: async () => {
      const db = getDb();
      const today = todayIso();
      const active = and(isNull(animals.deletedAt), eq(animals.status, "active"));
      const [counts] = await db
        .select({
          total: sql<number>`count(*)`,
          female: sql<number>`sum(case when ${animals.sex} = 'female' then 1 else 0 end)`,
          male: sql<number>`sum(case when ${animals.sex} = 'male' then 1 else 0 end)`,
          lambs: sql<number>`sum(case when ${animals.birthDate} >= ${addDays(today, -180)} then 1 else 0 end)`,
          pregnant: sql<number>`sum(case when ${animals.isPregnant} = 1 then 1 else 0 end)`,
          sheep: sql<number>`sum(case when ${animals.species} = 'sheep' then 1 else 0 end)`,
          goat: sql<number>`sum(case when ${animals.species} = 'goat' then 1 else 0 end)`,
        })
        .from(animals)
        .where(active);

      const upcomingBirths = await db
        .select({ id: animals.id, tagNo: animals.tagNo, name: animals.name, expectedBirthAt: animals.expectedBirthAt })
        .from(animals)
        .where(and(active, eq(animals.isPregnant, true), lte(animals.expectedBirthAt, addDays(today, 30))))
        .orderBy(asc(animals.expectedBirthAt))
        .limit(10);

      const overdue = await db
        .select({ id: healthRecords.id, animalId: healthRecords.animalId, tagNo: animals.tagNo, productName: healthRecords.productName, type: healthRecords.type, nextDueAt: healthRecords.nextDueAt })
        .from(healthRecords)
        .innerJoin(animals, eq(animals.id, healthRecords.animalId))
        .where(and(isNull(healthRecords.deletedAt), eq(animals.status, "active"), lt(healthRecords.nextDueAt, today)))
        .orderBy(asc(healthRecords.nextDueAt))
        .limit(10);

      const withdrawal = await db
        .select({ id: healthRecords.id, animalId: healthRecords.animalId, tagNo: animals.tagNo, productName: healthRecords.productName, withdrawalUntil: healthRecords.withdrawalUntil })
        .from(healthRecords)
        .innerJoin(animals, eq(animals.id, healthRecords.animalId))
        .where(and(isNull(healthRecords.deletedAt), gte(healthRecords.withdrawalUntil, today)))
        .orderBy(asc(healthRecords.withdrawalUntil))
        .limit(10);

      const notWeighed = await db
        .select({ n: sql<number>`count(*)` })
        .from(animals)
        .where(and(active, isNull(animals.currentWeight)));

      const recentWeights = await db
        .select({ id: weightRecords.id, animalId: weightRecords.animalId, tagNo: animals.tagNo, weightKg: weightRecords.weightKg, weighedAt: weightRecords.weighedAt })
        .from(weightRecords)
        .innerJoin(animals, eq(animals.id, weightRecords.animalId))
        .where(isNull(weightRecords.deletedAt))
        .orderBy(desc(weightRecords.weighedAt))
        .limit(6);

      return {
        counts: {
          total: counts?.total ?? 0,
          female: counts?.female ?? 0,
          male: counts?.male ?? 0,
          lambs: counts?.lambs ?? 0,
          pregnant: counts?.pregnant ?? 0,
          sheep: counts?.sheep ?? 0,
          goat: counts?.goat ?? 0,
          notWeighed: notWeighed[0]?.n ?? 0,
        },
        upcomingBirths,
        overdue,
        withdrawal,
        recentWeights,
      };
    },
  });
}
