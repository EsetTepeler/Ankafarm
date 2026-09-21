import { DAILY_ROUND_TAG, observationInputSchema, observationTagInputSchema, type ObservationCategory, type Severity } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, desc, eq, gte, isNull, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { observationTags, observations, type LocalObservation } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertManyLocal, softDeleteManyLocal } from "@/sync/local";
import { todayIso } from "@/utils/date";

export function useObservations(animalId: string | undefined) {
  return useQuery({
    queryKey: localKey("observations", animalId ?? ""),
    enabled: !!animalId,
    queryFn: () =>
      getDb()
        .select()
        .from(observations)
        .where(and(eq(observations.animalId, animalId!), isNull(observations.deletedAt)))
        .orderBy(desc(observations.observedAt)),
  });
}

export function useObservationTags() {
  return useQuery({
    queryKey: localKey("observation_tags"),
    queryFn: () =>
      getDb()
        .select()
        .from(observationTags)
        .where(and(isNull(observationTags.deletedAt), eq(observationTags.active, true)))
        .orderBy(asc(observationTags.category), asc(observationTags.label)),
  });
}

/** Son N günde olağandışı gözlem sayısı; profil rozeti ve Bugün ekranı için. */
export function recentAbnormal(rows: LocalObservation[], days = 3, now = Date.now()): LocalObservation[] {
  const since = new Date(now - days * 86_400_000).toISOString();
  return rows.filter((o) => o.severity !== "normal" && o.observedAt >= since);
}

export interface ObservationDraft {
  animalId: string;
  observedAt: string;
  category: ObservationCategory;
  severity: Severity;
  tags: string[];
  note?: string | null;
}

export async function addObservation(draft: ObservationDraft): Promise<string> {
  const parsed = observationInputSchema.parse({ id: newId(), ...draft, note: draft.note ?? null, groupId: null });
  const [id] = await insertManyLocal("observations", [parsed]);
  return id!;
}

/** Toplu tur: "hepsi normal" varsayılanı; sadece işaretlenenler kayıt olur. */
export async function addObservations(drafts: ObservationDraft[]): Promise<string[]> {
  const rows = drafts.map((d) => observationInputSchema.parse({ id: newId(), ...d, note: d.note ?? null, groupId: null }));
  return insertManyLocal("observations", rows);
}

/**
 * Günlük tur: işaretlenen hayvanların gözlemleri, bir de sürü düzeyinde tur kaydı (hayvansız satır).
 * Hepsi tek yerel işlemde yazılır ve tek push ile gider; "hepsi normal" günde yalnızca tur kaydı kalır.
 */
export async function saveDailyRound(input: { observedAt: string; groupId: string | null; checked: number; drafts: ObservationDraft[] }): Promise<number> {
  const rows = [
    ...input.drafts.map((d) => observationInputSchema.parse({ id: newId(), ...d, note: d.note ?? null, groupId: null })),
    observationInputSchema.parse({
      id: newId(),
      animalId: null,
      groupId: input.groupId,
      observedAt: input.observedAt,
      category: "note",
      severity: "normal",
      tags: [DAILY_ROUND_TAG],
      note: `${input.checked} hayvan kontrol edildi, ${input.drafts.length} işaretli`,
    }),
  ];
  await insertManyLocal("observations", rows);
  return input.drafts.length;
}

/** Bugün tur yapıldı mı? Bugün ekranı ve tur sayfası için. */
export function useTodayRound() {
  return useQuery({
    queryKey: localKey("observations", "round", todayIso()),
    queryFn: async (): Promise<LocalObservation | null> => {
      const [row] = await getDb()
        .select()
        .from(observations)
        .where(and(isNull(observations.deletedAt), isNull(observations.animalId), gte(observations.observedAt, `${todayIso()}T00:00:00`)))
        .orderBy(desc(observations.observedAt))
        .limit(1);
      return row ?? null;
    },
  });
}

export async function deleteObservation(id: string) {
  await softDeleteManyLocal("observations", [id], "yanlış giriş");
}

export async function createObservationTag(category: ObservationCategory, label: string): Promise<string> {
  const parsed = observationTagInputSchema.parse({ id: newId(), category, label });
  const [existing] = await getDb()
    .select({ id: observationTags.id })
    .from(observationTags)
    .where(and(isNull(observationTags.deletedAt), eq(observationTags.category, category), eq(observationTags.label, parsed.label)))
    .limit(1);
  if (existing) return existing.id;
  const [id] = await insertManyLocal("observation_tags", { ...parsed, isSeed: false, active: true } as never);
  return id!;
}

/** Bugün ekranı: son 3 günün olağandışı gözlemleri, hayvan bazında. */
export function useRecentAbnormalObservations(days = 3) {
  return useQuery({
    queryKey: localKey("observations", "recent-abnormal", days),
    queryFn: () =>
      getDb()
        .select()
        .from(observations)
        .where(and(isNull(observations.deletedAt), ne(observations.severity, "normal"), gte(observations.observedAt, new Date(Date.now() - days * 86_400_000).toISOString())))
        .orderBy(desc(observations.observedAt))
        .limit(50),
  });
}
