import { animalInputSchema, animalPatchSchema, type AnimalInput, type AnimalPatch, type Sex, type Species } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, eq, isNull, like, ne, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, breeds, groups, type LocalAnimal } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertLocal, updateLocal } from "@/sync/local";

export interface AnimalFilter {
  search?: string;
  status?: "active" | "archived" | "all";
  species?: Species;
  sex?: Sex;
  groupId?: string;
}

export interface AnimalListItem extends LocalAnimal {
  breedName: string | null;
  groupName: string | null;
}

function buildWhere(f: AnimalFilter): SQL | undefined {
  const conds: (SQL | undefined)[] = [isNull(animals.deletedAt)];
  const status = f.status ?? "active";
  if (status === "active") conds.push(eq(animals.status, "active"));
  if (status === "archived") conds.push(ne(animals.status, "active"));
  if (f.species) conds.push(eq(animals.species, f.species));
  if (f.sex) conds.push(eq(animals.sex, f.sex));
  if (f.groupId) conds.push(eq(animals.groupId, f.groupId));
  const q = f.search?.trim();
  if (q) conds.push(or(like(animals.tagNo, `%${q.toUpperCase()}%`), like(animals.name, `%${q}%`)));
  return and(...conds);
}

export function useAnimals(filter: AnimalFilter) {
  return useQuery({
    queryKey: localKey("animals", "list", filter),
    queryFn: async (): Promise<AnimalListItem[]> => {
      const rows = await getDb()
        .select({ animal: animals, breedName: breeds.name, groupName: groups.name })
        .from(animals)
        .leftJoin(breeds, eq(breeds.id, animals.breedId))
        .leftJoin(groups, eq(groups.id, animals.groupId))
        .where(buildWhere(filter))
        .orderBy(asc(animals.tagNo));
      return rows.map((r) => ({ ...r.animal, breedName: r.breedName, groupName: r.groupName }));
    },
  });
}

export function useAnimal(id: string | undefined) {
  return useQuery({
    queryKey: localKey("animals", "one", id),
    enabled: !!id,
    queryFn: async (): Promise<AnimalListItem | null> => {
      const [r] = await getDb()
        .select({ animal: animals, breedName: breeds.name, groupName: groups.name })
        .from(animals)
        .leftJoin(breeds, eq(breeds.id, animals.breedId))
        .leftJoin(groups, eq(groups.id, animals.groupId))
        .where(eq(animals.id, id!))
        .limit(1);
      return r ? { ...r.animal, breedName: r.breedName, groupName: r.groupName } : null;
    },
  });
}

/** Anne veya baba seçimi için adaylar: aynı tür, istenen cinsiyet, aktif. */
export function useParentCandidates(species: Species, sex: Sex, excludeId?: string) {
  return useQuery({
    queryKey: localKey("animals", "parents", species, sex, excludeId ?? ""),
    queryFn: () =>
      getDb()
        .select({ id: animals.id, tagNo: animals.tagNo, name: animals.name, breedId: animals.breedId })
        .from(animals)
        .where(
          and(
            isNull(animals.deletedAt),
            eq(animals.species, species),
            eq(animals.sex, sex),
            excludeId ? ne(animals.id, excludeId) : undefined,
          ),
        )
        .orderBy(asc(animals.tagNo)),
  });
}

export class DuplicateTagError extends Error {
  constructor(tagNo: string) {
    super(`Bu küpe numarası zaten kayıtlı: ${tagNo}`);
    this.name = "DuplicateTagError";
  }
}

async function assertTagFree(tagNo: string, exceptId?: string) {
  const [row] = await getDb()
    .select({ id: animals.id })
    .from(animals)
    .where(and(isNull(animals.deletedAt), eq(animals.tagNo, tagNo), exceptId ? ne(animals.id, exceptId) : undefined))
    .limit(1);
  if (row) throw new DuplicateTagError(tagNo);
}

/** Yeni hayvan: paylaşılan şema ile doğrular, yerel küpe tekilliğini kontrol eder, yerel yazar ve kuyruğa alır. */
export async function createAnimal(input: Omit<AnimalInput, "id"> & { id?: string }): Promise<string> {
  const id = input.id ?? newId();
  const parsed = animalInputSchema.parse({ ...input, id });
  await assertTagFree(parsed.tagNo);
  return insertLocal("animals", parsed);
}

export async function updateAnimal(id: string, patch: AnimalPatch): Promise<void> {
  const parsed = animalPatchSchema.parse(patch);
  if (parsed.tagNo) await assertTagFree(parsed.tagNo, id);
  await updateLocal("animals", id, parsed);
}
