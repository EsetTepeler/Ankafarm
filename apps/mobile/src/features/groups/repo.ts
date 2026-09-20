import { groupInputSchema, type GroupKind } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { asc, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { groups } from "@/db/schema";
import { localKey } from "@/sync/events";
import { insertLocal, softDeleteLocal, updateLocal } from "@/sync/local";

export function useGroups() {
  return useQuery({
    queryKey: localKey("groups"),
    queryFn: () => getDb().select().from(groups).where(isNull(groups.deletedAt)).orderBy(asc(groups.name)),
  });
}

export async function createGroup(input: { name: string; kind: GroupKind; capacity?: number | null }) {
  const parsed = groupInputSchema.omit({ id: true }).parse(input);
  return insertLocal("groups", { name: parsed.name, kind: parsed.kind, capacity: parsed.capacity ?? null, active: parsed.active });
}

export async function renameGroup(id: string, name: string) {
  const parsed = groupInputSchema.shape.name.parse(name);
  return updateLocal("groups", id, { name: parsed });
}

export async function deleteGroup(id: string, reason?: string) {
  return softDeleteLocal("groups", id, reason);
}
