import { labels, type BirthDifficulty, type ExitType, type HealthType, type Sex, type Species } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, eq, gte, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breeds, consumptions, exitRecords, expenses, healthRecords, incomes, lambingRecords, purchases, stockItems } from "@/db/schema";
import { localKey } from "@/sync/events";
import { todayIso } from "@/utils/date";

/** Son n ayın "YYYY-AA" listesi, eskiden yeniye. */
export function lastMonths(n: number, from = todayIso()): string[] {
  const [y, m] = from.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function ageGroup(birthDate: string | null): string {
  if (!birthDate) return "Bilinmiyor";
  const months = (Date.now() - new Date(`${birthDate}T00:00:00Z`).getTime()) / (30.44 * 86_400_000);
  if (months < 6) return "0-6 ay";
  if (months < 12) return "6-12 ay";
  if (months < 24) return "1-2 yaş";
  return "2 yaş üstü";
}

export interface Slice {
  name: string;
  value: number;
}

/** Sürü yapısı: tür, cinsiyet, yaş grubu ve ırk dağılımı. Aktif hayvanlardan, yerel veritabanından. */
export function useHerdStructure() {
  return useQuery({
    queryKey: localKey("animals", "report", "herd"),
    queryFn: async () => {
      const rows = await getDb()
        .select({ species: animals.species, sex: animals.sex, birthDate: animals.birthDate, breedName: breeds.name, weight: animals.currentWeight })
        .from(animals)
        .leftJoin(breeds, eq(breeds.id, animals.breedId))
        .where(and(isNull(animals.deletedAt), eq(animals.status, "active")));

      const tally = (key: (r: (typeof rows)[number]) => string): Slice[] => {
        const map = new Map<string, number>();
        for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + 1);
        return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      };

      const weights = rows.map((r) => r.weight).filter((w): w is number => w != null);
      return {
        total: rows.length,
        bySpecies: tally((r) => labels.species[r.species as Species] ?? r.species),
        bySex: tally((r) => labels.sex[r.sex as Sex] ?? r.sex),
        byAge: tally((r) => ageGroup(r.birthDate)),
        byBreed: tally((r) => r.breedName ?? "Irk girilmemiş"),
        avgWeight: weights.length ? weights.reduce((s, w) => s + w, 0) / weights.length : null,
        weighed: weights.length,
      };
    },
  });
}

export interface MonthMoney {
  month: string;
  label: string;
  expense: number;
  income: number;
}

/** Aylık gider (alımlar + stok dışı giderler) ve gelir; son n ay. */
export function useMonthlyMoney(months = 12) {
  return useQuery({
    queryKey: localKey("expenses", "report", "money", months),
    queryFn: async (): Promise<MonthMoney[]> => {
      const db = getDb();
      const range = lastMonths(months);
      const from = `${range[0]}-01`;
      const [buys, exp, inc] = await Promise.all([
        db
          .select({ month: sql<string>`substr(${purchases.purchasedAt}, 1, 7)`, amount: sql<number>`sum(coalesce(${purchases.total}, 0))` })
          .from(purchases)
          .where(and(isNull(purchases.deletedAt), gte(purchases.purchasedAt, from)))
          .groupBy(sql`substr(${purchases.purchasedAt}, 1, 7)`),
        db
          .select({ month: sql<string>`substr(${expenses.spentAt}, 1, 7)`, amount: sql<number>`sum(${expenses.amount})` })
          .from(expenses)
          .where(and(isNull(expenses.deletedAt), gte(expenses.spentAt, from)))
          .groupBy(sql`substr(${expenses.spentAt}, 1, 7)`),
        db
          .select({ month: sql<string>`substr(${incomes.receivedAt}, 1, 7)`, amount: sql<number>`sum(${incomes.amount})` })
          .from(incomes)
          .where(and(isNull(incomes.deletedAt), gte(incomes.receivedAt, from)))
          .groupBy(sql`substr(${incomes.receivedAt}, 1, 7)`),
      ]);
      const pick = (rows: { month: string; amount: number }[], month: string) => rows.find((r) => r.month === month)?.amount ?? 0;
      return range.map((month) => ({
        month,
        label: monthLabel(month),
        expense: pick(buys, month) + pick(exp, month),
        income: pick(inc, month),
      }));
    },
  });
}

export interface ConsumptionPoint {
  month: string;
  label: string;
  item: string;
  quantity: number;
  unit: string;
}

/** Kalem bazında aylık tüketim; son n ay, yem ve su kalemleri. */
export function useMonthlyConsumption(months = 6) {
  return useQuery({
    queryKey: localKey("consumptions", "report", months),
    queryFn: async (): Promise<ConsumptionPoint[]> => {
      const range = lastMonths(months);
      const rows = await getDb()
        .select({
          month: sql<string>`substr(${consumptions.consumedOn}, 1, 7)`,
          item: stockItems.name,
          unit: stockItems.unit,
          quantity: sql<number>`sum(${consumptions.quantity})`,
        })
        .from(consumptions)
        .innerJoin(stockItems, eq(stockItems.id, consumptions.itemId))
        .where(and(isNull(consumptions.deletedAt), gte(consumptions.consumedOn, `${range[0]}-01`)))
        .groupBy(sql`substr(${consumptions.consumedOn}, 1, 7)`, stockItems.name, stockItems.unit);
      return rows.map((r) => ({ ...r, label: monthLabel(r.month), quantity: r.quantity ?? 0 }));
    },
  });
}

/** Doğum, sağlık ve çıkış özetleri; tümü yerel veriden. */
export function useProductionReport() {
  return useQuery({
    queryKey: localKey("lambing_records", "report"),
    queryFn: async () => {
      const db = getDb();
      const [lambings, health, exits] = await Promise.all([
        db.select().from(lambingRecords).where(isNull(lambingRecords.deletedAt)),
        db
          .select({ type: healthRecords.type, n: sql<number>`count(*)`, cost: sql<number>`sum(coalesce(${healthRecords.cost}, 0))` })
          .from(healthRecords)
          .where(isNull(healthRecords.deletedAt))
          .groupBy(healthRecords.type),
        db
          .select({ type: exitRecords.type, n: sql<number>`count(*)`, income: sql<number>`sum(coalesce(${exitRecords.price}, 0))` })
          .from(exitRecords)
          .where(isNull(exitRecords.deletedAt))
          .groupBy(exitRecords.type),
      ]);

      const live = lambings.reduce((s, l) => s + l.liveCount, 0);
      const still = lambings.reduce((s, l) => s + l.stillbornCount, 0);
      const byDifficulty = new Map<string, number>();
      for (const l of lambings) byDifficulty.set(l.difficulty, (byDifficulty.get(l.difficulty) ?? 0) + 1);
      const byMonth = new Map<string, number>();
      for (const l of lambings) {
        const month = l.bornAt.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) ?? 0) + l.liveCount);
      }

      return {
        births: lambings.length,
        live,
        stillborn: still,
        perBirth: lambings.length ? live / lambings.length : 0,
        survival: live + still ? live / (live + still) : null,
        byDifficulty: [...byDifficulty.entries()].map(([k, value]) => ({ name: labels.birthDifficulty[k as BirthDifficulty] ?? k, value })),
        birthsByMonth: lastMonths(12).map((month) => ({ name: monthLabel(month), value: byMonth.get(month) ?? 0 })),
        health: health.map((h) => ({ name: labels.healthType[h.type as HealthType] ?? h.type, count: h.n, cost: h.cost ?? 0 })),
        healthCost: health.reduce((s, h) => s + (h.cost ?? 0), 0),
        exits: exits.map((e) => ({ name: labels.exitType[e.type as ExitType] ?? e.type, count: e.n, income: e.income ?? 0 })),
        exitIncome: exits.reduce((s, e) => s + (e.income ?? 0), 0),
      };
    },
  });
}
