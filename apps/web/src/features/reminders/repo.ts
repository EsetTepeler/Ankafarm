import { labels, reminderInputSchema, type HealthType } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breedingRecords, healthRecords, reminders } from "@/db/schema";
import { localKey } from "@/sync/events";
import { insertLocal, softDeleteLocal, updateLocal } from "@/sync/local";
import { newId, nowIso } from "@/lib/ids";
import { todayIso } from "@/utils/date";

/** Çiftleşmeden sonra gebelik kontrolü beklenen gün; Bugün ekranıyla aynı eşik. */
const PREGNANCY_CHECK_DAYS = 45;

export type ReminderKind = "manual" | "health" | "pregnancy" | "withdrawal";

export interface ReminderItem {
  id: string;
  kind: ReminderKind;
  title: string;
  /** YYYY-AA-GG; listeler buna göre gruplanır. */
  dueAt: string;
  note: string | null;
  animalId: string | null;
  tagNo: string | null;
  doneAt: string | null;
  /** Türev işlerde "tamamla" yok: iş, kaydın kendisi girilince biter. */
  completable: boolean;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Hatırlatıcılar (madde 3.3): elle girilenler `reminders` tablosundan, türev işler kayıtlardan hesaplanır.
 * Türevleri tabloya yazmıyoruz; tek doğruluk kaynağı kaydın kendisi olsun, senkronda ikinci bir yol açılmasın.
 */
export function useReminders() {
  return useQuery({
    queryKey: localKey("reminders", "list"),
    queryFn: async (): Promise<ReminderItem[]> => {
      const db = getDb();
      const today = todayIso();
      const horizon = addDays(today, 60);

      const [manual, due, withdrawal, checks] = await Promise.all([
        db
          .select({ r: reminders, tagNo: animals.tagNo })
          .from(reminders)
          .leftJoin(animals, eq(animals.id, reminders.animalId))
          .where(isNull(reminders.deletedAt))
          .orderBy(asc(reminders.dueAt))
          .limit(200),
        db
          .select({ id: healthRecords.id, animalId: healthRecords.animalId, tagNo: animals.tagNo, type: healthRecords.type, productName: healthRecords.productName, nextDueAt: healthRecords.nextDueAt })
          .from(healthRecords)
          .innerJoin(animals, eq(animals.id, healthRecords.animalId))
          .where(and(isNull(healthRecords.deletedAt), eq(animals.status, "active"), lt(healthRecords.nextDueAt, horizon)))
          .orderBy(asc(healthRecords.nextDueAt))
          .limit(200),
        db
          .select({ id: healthRecords.id, animalId: healthRecords.animalId, tagNo: animals.tagNo, productName: healthRecords.productName, withdrawalUntil: healthRecords.withdrawalUntil })
          .from(healthRecords)
          .innerJoin(animals, eq(animals.id, healthRecords.animalId))
          .where(and(isNull(healthRecords.deletedAt), eq(animals.status, "active"), gte(healthRecords.withdrawalUntil, today)))
          .orderBy(asc(healthRecords.withdrawalUntil))
          .limit(100),
        db
          .select({ id: breedingRecords.id, animalId: breedingRecords.femaleId, tagNo: animals.tagNo, matedAt: breedingRecords.matedAt })
          .from(breedingRecords)
          .innerJoin(animals, eq(animals.id, breedingRecords.femaleId))
          .where(and(isNull(breedingRecords.deletedAt), eq(animals.status, "active"), eq(breedingRecords.pregnancyResult, "pending")))
          .orderBy(asc(breedingRecords.matedAt))
          .limit(100),
      ]);

      const items: ReminderItem[] = [
        ...manual.map(({ r, tagNo }) => ({
          id: r.id,
          kind: "manual" as const,
          title: r.title,
          dueAt: r.dueAt,
          note: r.note,
          animalId: r.animalId,
          tagNo,
          doneAt: r.doneAt,
          completable: true,
        })),
        ...due.map((h) => ({
          id: `health:${h.id}`,
          kind: "health" as const,
          title: `${h.tagNo} · ${h.productName ?? labels.healthType[h.type as HealthType] ?? "doz"} zamanı`,
          dueAt: h.nextDueAt!,
          note: "Sağlık kaydı girilince iş kapanır",
          animalId: h.animalId,
          tagNo: h.tagNo,
          doneAt: null,
          completable: false,
        })),
        ...withdrawal.map((h) => ({
          id: `withdrawal:${h.id}`,
          kind: "withdrawal" as const,
          title: `${h.tagNo} · arınma süresi biter`,
          dueAt: h.withdrawalUntil!,
          note: `${h.productName ?? "İlaç"} sonrası bekleme`,
          animalId: h.animalId,
          tagNo: h.tagNo,
          doneAt: null,
          completable: false,
        })),
        ...checks.map((b) => ({
          id: `pregnancy:${b.id}`,
          kind: "pregnancy" as const,
          title: `${b.tagNo} · gebelik kontrolü`,
          dueAt: addDays(b.matedAt.slice(0, 10), PREGNANCY_CHECK_DAYS),
          note: "Çiftleşmenin üzerinden 45 gün geçiyor",
          animalId: b.animalId,
          tagNo: b.tagNo,
          doneAt: null,
          completable: false,
        })),
      ];

      return items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },
  });
}

/** Tamamlananlar; en son işaretlenenden başlayarak 50 kayıt. */
export function useDoneReminders() {
  return useQuery({
    queryKey: localKey("reminders", "done"),
    queryFn: () =>
      getDb()
        .select({ r: reminders, tagNo: animals.tagNo })
        .from(reminders)
        .leftJoin(animals, eq(animals.id, reminders.animalId))
        .where(and(isNull(reminders.deletedAt), sql`${reminders.doneAt} is not null`))
        .orderBy(desc(reminders.doneAt))
        .limit(50),
  });
}

export async function addReminder(input: { title: string; dueAt: string; animalId?: string | null; note?: string | null }) {
  const parsed = reminderInputSchema.parse({ id: newId(), ...input });
  return insertLocal("reminders", {
    title: parsed.title,
    dueAt: parsed.dueAt,
    animalId: parsed.animalId ?? null,
    groupId: null,
    note: parsed.note ?? null,
    doneAt: null,
  });
}

export async function completeReminder(id: string, done = true) {
  return updateLocal("reminders", id, { doneAt: done ? nowIso() : null });
}

export async function deleteReminder(id: string) {
  return softDeleteLocal("reminders", id);
}
