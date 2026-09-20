import { healthInputSchema, withdrawalUntil, type HealthType } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { healthRecords, type LocalHealthRecord } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertManyLocal, softDeleteManyLocal } from "@/sync/local";
import { todayIso } from "@/utils/date";

/** Formun tuttuğu ham değerler; sayılar metin olarak gelir, parse burada yapılır. */
export interface HealthFormValues {
  type: HealthType;
  productName: string;
  dose: string;
  doseUnit: string;
  appliedAt: string | null;
  vetName: string;
  nextDueAt: string | null;
  withdrawalDays: string;
  cost: string;
  notes: string;
}

export const emptyHealthForm: HealthFormValues = {
  type: "vaccine",
  productName: "",
  dose: "",
  doseUnit: "ml",
  appliedAt: todayIso(),
  vetName: "",
  nextDueAt: null,
  withdrawalDays: "",
  cost: "",
  notes: "",
};

const numberOrNull = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n)) throw new Error("Sayı olmalı: " + s);
  return n;
};

/** Form → doğrulanmış kayıt alanları (id ve animalId hariç). */
export function healthFieldsFromForm(v: HealthFormValues) {
  if (!v.appliedAt) throw new Error("Uygulama tarihi gerekli");
  const appliedAt = new Date(`${v.appliedAt}T12:00:00`).toISOString();
  const parsed = healthInputSchema.omit({ id: true, animalId: true }).parse({
    type: v.type,
    productName: v.productName.trim() || null,
    dose: numberOrNull(v.dose),
    doseUnit: v.dose.trim() ? v.doseUnit.trim() || null : null,
    appliedAt,
    vetName: v.vetName.trim() || null,
    nextDueAt: v.nextDueAt,
    withdrawalDays: numberOrNull(v.withdrawalDays),
    cost: numberOrNull(v.cost),
    notes: v.notes.trim() || null,
  });
  return { ...parsed, withdrawalUntil: withdrawalUntil(parsed.appliedAt, parsed.withdrawalDays) };
}

export function useHealth(animalId: string | undefined) {
  return useQuery({
    queryKey: localKey("health_records", animalId ?? ""),
    enabled: !!animalId,
    queryFn: () =>
      getDb()
        .select()
        .from(healthRecords)
        .where(and(eq(healthRecords.animalId, animalId!), isNull(healthRecords.deletedAt)))
        .orderBy(desc(healthRecords.appliedAt)),
  });
}

export interface HealthStatus {
  withdrawalUntil: string | null;
  overdueCount: number;
  nextDueAt: string | null;
}

/** Rozet için: süren arınma, gecikmiş tekrar dozu, yaklaşan tekrar. */
export function healthStatus(rows: LocalHealthRecord[], today = todayIso()): HealthStatus {
  let withdrawal: string | null = null;
  let overdue = 0;
  let next: string | null = null;
  for (const r of rows) {
    if (r.withdrawalUntil && r.withdrawalUntil >= today && (!withdrawal || r.withdrawalUntil > withdrawal)) withdrawal = r.withdrawalUntil;
    if (r.nextDueAt) {
      if (r.nextDueAt < today) overdue += 1;
      else if (!next || r.nextDueAt < next) next = r.nextDueAt;
    }
  }
  return { withdrawalUntil: withdrawal, overdueCount: overdue, nextDueAt: next };
}

export async function addHealth(animalId: string, values: HealthFormValues): Promise<string> {
  const fields = healthFieldsFromForm(values);
  const [id] = await insertManyLocal("health_records", [{ ...fields, id: newId(), animalId, batchId: null }]);
  return id!;
}

/** Sürünün tamamına veya seçilen hayvanlara aynı kayıt; ortak batch_id ile geri alınabilir. */
export async function addHealthBulk(animalIds: string[], values: HealthFormValues): Promise<{ batchId: string; count: number }> {
  const fields = healthFieldsFromForm(values);
  const batchId = newId();
  const rows = animalIds.map((animalId) => ({ ...fields, id: newId(), animalId, batchId }));
  await insertManyLocal("health_records", rows);
  return { batchId, count: rows.length };
}

export async function undoHealthBatch(batchId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: healthRecords.id })
    .from(healthRecords)
    .where(and(eq(healthRecords.batchId, batchId), isNull(healthRecords.deletedAt)));
  await softDeleteManyLocal(
    "health_records",
    rows.map((r) => r.id),
    "toplu giriş geri alındı",
  );
  return rows.length;
}

export async function deleteHealth(id: string, reason?: string) {
  await softDeleteManyLocal("health_records", [id], reason);
}
