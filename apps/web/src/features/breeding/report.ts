import { useQuery } from "@tanstack/react-query";
import { asc, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breedingRecords, lambingRecords, weightRecords } from "@/db/schema";
import { localKey } from "@/sync/events";

/** Doğum kilosu sayılan pencere: doğumdan sonraki ilk hafta. */
const BIRTH_WEIGHT_DAYS = 7;

export interface SireStats {
  id: string;
  tagNo: string;
  name: string | null;
  status: string;
  /** Çiftleştiği dişi sayısı (tekrarlar sayılmaz). */
  mates: number;
  births: number;
  lambs: number;
  stillborn: number;
  survival: number | null;
  perBirth: number | null;
  /** Yavrularının ortalama doğum kilosu. */
  birthWeight: number | null;
  /** Yavrularının ortalama günlük kilo artışı, gram. */
  adg: number | null;
  aliveOffspring: number;
  lastBirth: string | null;
}

export interface DamStats {
  id: string;
  tagNo: string;
  name: string | null;
  status: string;
  isPregnant: boolean;
  expectedBirthAt: string | null;
  births: number;
  lambs: number;
  stillborn: number;
  survival: number | null;
  perBirth: number | null;
  /** Ardışık doğumlar arası ortalama gün. */
  interval: number | null;
  lastBirth: string | null;
  aliveOffspring: number;
}

function days(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * Damızlık analitiği (madde 3.7): koç ve anne bazında doğum, yavru ve büyüme özetleri.
 * Tamamı yerel veritabanından; akrabalık kontrolü ve tekil performans kartı çiftleşme formunda (1.9).
 */
export function useBreedingPerformance() {
  return useQuery({
    queryKey: localKey("lambing_records", "performance"),
    queryFn: async (): Promise<{ sires: SireStats[]; dams: DamStats[] }> => {
      const db = getDb();
      const [all, lambings, matings, weights] = await Promise.all([
        db.select().from(animals).where(isNull(animals.deletedAt)),
        db.select().from(lambingRecords).where(isNull(lambingRecords.deletedAt)).orderBy(asc(lambingRecords.bornAt)),
        db.select().from(breedingRecords).where(isNull(breedingRecords.deletedAt)),
        db.select({ animalId: weightRecords.animalId, weighedAt: weightRecords.weighedAt, weightKg: weightRecords.weightKg }).from(weightRecords).where(isNull(weightRecords.deletedAt)).orderBy(asc(weightRecords.weighedAt)),
      ]);

      const weightsByAnimal = new Map<string, { weighedAt: string; weightKg: number }[]>();
      for (const w of weights) {
        const list = weightsByAnimal.get(w.animalId) ?? [];
        list.push(w);
        weightsByAnimal.set(w.animalId, list);
      }

      /** Yavrunun doğum kilosu ve günlük artışı; ikisi de yoksa null döner. */
      const growth = (childId: string, birthDate: string | null) => {
        const list = weightsByAnimal.get(childId) ?? [];
        if (!birthDate || list.length === 0) return { birthWeight: null as number | null, adg: null as number | null };
        const first = list[0]!;
        const birthWeight = days(birthDate, first.weighedAt.slice(0, 10)) <= BIRTH_WEIGHT_DAYS ? first.weightKg : null;
        const last = list[list.length - 1]!;
        const span = days(first.weighedAt.slice(0, 10), last.weighedAt.slice(0, 10));
        const adg = span > 0 ? ((last.weightKg - first.weightKg) / span) * 1000 : null;
        return { birthWeight, adg };
      };

      const childrenOf = (parent: "motherId" | "fatherId", id: string) => all.filter((a) => a[parent === "motherId" ? "motherId" : "fatherId"] === id);

      const sires: SireStats[] = all
        .filter((a) => a.sex === "male")
        .map((male) => {
          const births = lambings.filter((l) => l.fatherId === male.id);
          const lambs = births.reduce((s, l) => s + l.liveCount, 0);
          const stillborn = births.reduce((s, l) => s + l.stillbornCount, 0);
          const kids = childrenOf("fatherId", male.id);
          const growths = kids.map((k) => growth(k.id, k.birthDate));
          return {
            id: male.id,
            tagNo: male.tagNo,
            name: male.name,
            status: male.status,
            mates: new Set(matings.filter((m) => m.maleId === male.id).map((m) => m.femaleId)).size,
            births: births.length,
            lambs,
            stillborn,
            survival: lambs + stillborn ? lambs / (lambs + stillborn) : null,
            perBirth: births.length ? lambs / births.length : null,
            birthWeight: mean(growths.map((g) => g.birthWeight).filter((v): v is number => v != null)),
            adg: mean(growths.map((g) => g.adg).filter((v): v is number => v != null)),
            aliveOffspring: kids.filter((k) => k.status === "active").length,
            lastBirth: births.length ? births[births.length - 1]!.bornAt : null,
          };
        })
        .filter((s) => s.mates > 0 || s.births > 0 || s.aliveOffspring > 0)
        .sort((a, b) => b.lambs - a.lambs || b.mates - a.mates);

      const dams: DamStats[] = all
        .filter((a) => a.sex === "female")
        .map((female) => {
          const births = lambings.filter((l) => l.motherId === female.id);
          const lambs = births.reduce((s, l) => s + l.liveCount, 0);
          const stillborn = births.reduce((s, l) => s + l.stillbornCount, 0);
          const gaps: number[] = [];
          for (let i = 1; i < births.length; i++) gaps.push(days(births[i - 1]!.bornAt, births[i]!.bornAt));
          return {
            id: female.id,
            tagNo: female.tagNo,
            name: female.name,
            status: female.status,
            isPregnant: female.isPregnant,
            expectedBirthAt: female.expectedBirthAt,
            births: births.length,
            lambs,
            stillborn,
            survival: lambs + stillborn ? lambs / (lambs + stillborn) : null,
            perBirth: births.length ? lambs / births.length : null,
            interval: mean(gaps),
            lastBirth: births.length ? births[births.length - 1]!.bornAt : null,
            aliveOffspring: childrenOf("motherId", female.id).filter((k) => k.status === "active").length,
          };
        })
        .filter((d) => d.births > 0 || d.isPregnant)
        .sort((a, b) => b.lambs - a.lambs || (b.lastBirth ?? "").localeCompare(a.lastBirth ?? ""));

      return { sires, dams };
    },
  });
}
