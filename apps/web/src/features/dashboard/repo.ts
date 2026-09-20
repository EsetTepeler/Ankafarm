import { breedingEvent, createdEvent, exitEvent, groupMoveEvent, healthEvent, lambingEvent, observationEvent, weightEvent, type AnimalEvent, type AnimalRef, type GroupRef } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breedingRecords, exitRecords, groupMovements, groups, healthRecords, lambingRecords, observations, weightRecords } from "@/db/schema";
import { todayIso } from "@/utils/date";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Gebelik kontrolü için çiftleşmeden sonra beklenen gün; 3.x'te çiftlik ayarına taşınır. */
const PREGNANCY_CHECK_DAYS = 45;
/** Bu kadar gündür tartılmayan hayvan "tartım gecikti" sayılır. */
const STALE_WEIGHT_DAYS = 60;

/** Bugün ekranının sayıları ve listeleri; tamamı yerel veritabanından. */
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

      // Çiftleşme üzerinden 45 gün geçmiş, gebelik kontrolü hâlâ yapılmamış.
      const pregnancyChecks = await db
        .select({ id: breedingRecords.id, animalId: breedingRecords.femaleId, tagNo: animals.tagNo, matedAt: breedingRecords.matedAt })
        .from(breedingRecords)
        .innerJoin(animals, eq(animals.id, breedingRecords.femaleId))
        .where(and(isNull(breedingRecords.deletedAt), eq(animals.status, "active"), eq(breedingRecords.pregnancyResult, "pending"), lte(breedingRecords.matedAt, `${addDays(today, -PREGNANCY_CHECK_DAYS)}T23:59:59`)))
        .orderBy(asc(breedingRecords.matedAt))
        .limit(10);

      // Son 60 günde tartımı olmayan aktif hayvanlar (hiç tartılmayanlar dahil).
      const staleCutoff = `${addDays(today, -STALE_WEIGHT_DAYS)}T00:00:00`;
      const [stale] = await db
        .select({ n: sql<number>`count(*)` })
        .from(animals)
        .where(
          and(
            active,
            sql`not exists (select 1 from ${weightRecords} w where w.animal_id = ${animals.id} and w.deleted_at is null and w.weighed_at >= ${staleCutoff})`,
          ),
        );
      const [notWeighed] = await db
        .select({ n: sql<number>`count(*)` })
        .from(animals)
        .where(and(active, isNull(animals.currentWeight)));

      return {
        counts: {
          total: counts?.total ?? 0,
          female: counts?.female ?? 0,
          male: counts?.male ?? 0,
          lambs: counts?.lambs ?? 0,
          pregnant: counts?.pregnant ?? 0,
          sheep: counts?.sheep ?? 0,
          goat: counts?.goat ?? 0,
          notWeighed: notWeighed?.n ?? 0,
          staleWeights: stale?.n ?? 0,
        },
        upcomingBirths,
        overdue,
        withdrawal,
        pregnancyChecks,
      };
    },
  });
}

export interface FeedItem {
  event: AnimalEvent;
  tagNo: string;
  name: string | null;
  /** Kayıt zamanı; akış buna göre sıralanır, olay zamanına değil. */
  recordedAt: string;
}

const FEED_LIMIT = 20;

/**
 * Çiftlik geneli son olaylar: her olay tablosundan en son kayıtlar, paylaşılan eşleyicilerle tek listede.
 * Anahtar "timeline": her yerel değişiklikte tazelenir (notifyLocalChange bunu da geçersiz kılar).
 */
export function useRecentEvents() {
  return useQuery({
    queryKey: ["local", "timeline", "farm-feed"],
    queryFn: async (): Promise<FeedItem[]> => {
      const db = getDb();
      const [created, weights, moves, health, breedings, lambings, exits, obs, groupRows] = await Promise.all([
        db.select().from(animals).where(isNull(animals.deletedAt)).orderBy(desc(animals.createdAt)).limit(FEED_LIMIT),
        db.select().from(weightRecords).where(isNull(weightRecords.deletedAt)).orderBy(desc(weightRecords.createdAt)).limit(FEED_LIMIT),
        db.select().from(groupMovements).where(isNull(groupMovements.deletedAt)).orderBy(desc(groupMovements.createdAt)).limit(FEED_LIMIT),
        db.select().from(healthRecords).where(isNull(healthRecords.deletedAt)).orderBy(desc(healthRecords.createdAt)).limit(FEED_LIMIT),
        db.select().from(breedingRecords).where(isNull(breedingRecords.deletedAt)).orderBy(desc(breedingRecords.createdAt)).limit(FEED_LIMIT),
        db.select().from(lambingRecords).where(isNull(lambingRecords.deletedAt)).orderBy(desc(lambingRecords.createdAt)).limit(FEED_LIMIT),
        db.select().from(exitRecords).where(isNull(exitRecords.deletedAt)).orderBy(desc(exitRecords.createdAt)).limit(FEED_LIMIT),
        db.select().from(observations).where(isNull(observations.deletedAt)).orderBy(desc(observations.createdAt)).limit(FEED_LIMIT),
        db.select({ id: groups.id, name: groups.name, kind: groups.kind }).from(groups),
      ]);

      const ids = new Set<string>();
      for (const w of weights) ids.add(w.animalId);
      for (const m of moves) ids.add(m.animalId);
      for (const h of health) ids.add(h.animalId);
      for (const b of breedings) for (const x of [b.femaleId, b.maleId]) if (x) ids.add(x);
      for (const l of lambings) for (const x of [l.motherId, l.fatherId]) if (x) ids.add(x);
      for (const e of exits) ids.add(e.animalId);
      for (const o of obs) if (o.animalId) ids.add(o.animalId);
      for (const a of created) ids.add(a.id);
      const refRows = ids.size ? await db.select({ id: animals.id, tagNo: animals.tagNo, name: animals.name }).from(animals).where(inArray(animals.id, [...ids])) : [];
      const refs = new Map<string, AnimalRef>(refRows.map((r) => [r.id, r]));
      const groupMap = new Map<string, GroupRef>(groupRows.map((g) => [g.id, g]));

      const items: FeedItem[] = [];
      const push = (event: AnimalEvent, recordedAt: string) => {
        const ref = refs.get(event.animalId);
        if (ref) items.push({ event, tagNo: ref.tagNo, name: ref.name ?? null, recordedAt });
      };
      for (const a of created) push(createdEvent(a), a.createdAt);
      for (const w of weights) push(weightEvent(w), w.createdAt);
      for (const m of moves) push(groupMoveEvent(m, groupMap), m.createdAt);
      for (const h of health) push(healthEvent(h), h.createdAt);
      for (const b of breedings) push(breedingEvent(b, b.femaleId, refs), b.createdAt);
      for (const l of lambings) push(lambingEvent(l, l.motherId, refs), l.createdAt);
      for (const e of exits) push(exitEvent(e), e.createdAt);
      for (const o of obs) if (o.animalId) push(observationEvent(o, o.animalId), o.createdAt);

      return items.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1)).slice(0, FEED_LIMIT);
    },
  });
}
