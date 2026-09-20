import { breedInputSchema, type Species } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { breeds } from "@/db/schema";
import { localKey } from "@/sync/events";
import { insertLocal } from "@/sync/local";

export function useBreeds(species?: Species) {
  return useQuery({
    queryKey: localKey("breeds", species ?? "all"),
    queryFn: () =>
      getDb()
        .select()
        .from(breeds)
        .where(and(isNull(breeds.deletedAt), eq(breeds.active, true), species ? eq(breeds.species, species) : undefined))
        .orderBy(asc(breeds.name)),
  });
}

export async function createBreed(input: { name: string; species: Species }): Promise<string> {
  const parsed = breedInputSchema.omit({ id: true }).parse(input);
  const db = getDb();
  const [existing] = await db
    .select({ id: breeds.id })
    .from(breeds)
    .where(and(isNull(breeds.deletedAt), eq(breeds.species, parsed.species), eq(breeds.name, parsed.name)))
    .limit(1);
  if (existing) return existing.id;
  return insertLocal("breeds", { name: parsed.name, species: parsed.species, isSeed: false, active: true });
}
