import { animalInputSchema, birthTypeFromCount, lambingInputSchema, type BirthDifficulty, type Sex } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breedingRecords, lambingRecords } from "@/db/schema";
import { refreshLocalPregnancy } from "@/features/breeding/repo";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertManyLocal } from "@/sync/local";

export function useLambings(motherId: string | undefined) {
  return useQuery({
    queryKey: localKey("lambing_records", motherId ?? ""),
    enabled: !!motherId,
    queryFn: () =>
      getDb()
        .select()
        .from(lambingRecords)
        .where(and(eq(lambingRecords.motherId, motherId!), isNull(lambingRecords.deletedAt)))
        .orderBy(desc(lambingRecords.bornAt)),
  });
}

export interface NewLamb {
  tagNo: string;
  sex: Sex;
  name?: string | null;
}

export interface LambingDraft {
  motherId: string;
  bornAt: string;
  difficulty: BirthDifficulty;
  stillbornCount: number;
  lambs: NewLamb[];
  notes?: string | null;
}

/**
 * Doğum kaydı + her canlı yavru için hayvan kaydı. Yavru: burada doğdu, anne ve baba bağlı,
 * ırk ve grup anneden, doğum tipi canlı sayısından, birth_id doğum kaydına.
 * Baba ve çiftleşme bağı: annenin sonrasında doğum olmayan son çiftleşmesinden.
 */
export async function addLambing(draft: LambingDraft): Promise<{ lambingId: string; lambIds: string[] }> {
  const db = getDb();
  const [mother] = await db.select().from(animals).where(eq(animals.id, draft.motherId)).limit(1);
  if (!mother) throw new Error("Anne bulunamadı");
  if (mother.sex !== "female") throw new Error("Doğum kaydı sadece dişi hayvana girilir");

  const [breeding] = await db
    .select({ id: breedingRecords.id, maleId: breedingRecords.maleId, matedAt: breedingRecords.matedAt })
    .from(breedingRecords)
    .where(and(eq(breedingRecords.femaleId, draft.motherId), isNull(breedingRecords.deletedAt)))
    .orderBy(desc(breedingRecords.matedAt))
    .limit(1);
  const linkBreeding = breeding && breeding.matedAt <= draft.bornAt ? breeding : null;

  const lambing = lambingInputSchema.parse({
    id: newId(),
    motherId: draft.motherId,
    fatherId: linkBreeding?.maleId ?? null,
    breedingId: linkBreeding?.id ?? null,
    bornAt: draft.bornAt,
    difficulty: draft.difficulty,
    liveCount: draft.lambs.length,
    stillbornCount: draft.stillbornCount,
    notes: draft.notes ?? null,
  });

  const lambRows = draft.lambs.map((l) =>
    animalInputSchema.parse({
      id: newId(),
      tagNo: l.tagNo,
      name: l.name ?? null,
      species: mother.species,
      breedId: mother.breedId,
      sex: l.sex,
      origin: "born_here",
      birthDate: draft.bornAt,
      birthDateEstimated: false,
      birthType: birthTypeFromCount(draft.lambs.length),
      birthId: lambing.id,
      motherId: draft.motherId,
      fatherId: lambing.fatherId ?? null,
      groupId: mother.groupId,
      status: "active",
    }),
  );

  // Küpe tekilliği: yerelde önceden kontrol, sunucu da kontrol eder.
  for (const lamb of lambRows) {
    const [dup] = await db
      .select({ id: animals.id })
      .from(animals)
      .where(and(isNull(animals.deletedAt), eq(animals.tagNo, lamb.tagNo)))
      .limit(1);
    if (dup) throw new Error(`Bu küpe numarası zaten kayıtlı: ${lamb.tagNo}`);
  }

  const [lambingId] = await insertManyLocal("lambing_records", [lambing]);
  const lambIds = await insertManyLocal("animals", lambRows);
  await refreshLocalPregnancy(draft.motherId);
  return { lambingId: lambingId!, lambIds };
}
