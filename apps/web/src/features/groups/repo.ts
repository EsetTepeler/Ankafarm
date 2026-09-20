import { groupInputSchema, groupMovementInputSchema, groupPatchSchema, type GroupKind } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, groupMovements, groups } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey, notifyLocalChange } from "@/sync/events";
import { insertLocal, insertManyLocal, softDeleteLocal, updateLocal } from "@/sync/local";

export function useGroups() {
  return useQuery({
    queryKey: localKey("groups"),
    queryFn: () => getDb().select().from(groups).where(isNull(groups.deletedAt)).orderBy(asc(groups.name)),
  });
}

/** Grup başına aktif hayvan sayısı. Anahtar "animals": her hayvan değişikliğinde tazelenir. */
export function useGroupCounts() {
  return useQuery({
    queryKey: localKey("animals", "groupCounts"),
    queryFn: async () => {
      const rows = await getDb()
        .select({ groupId: animals.groupId, n: count() })
        .from(animals)
        .where(and(isNull(animals.deletedAt), eq(animals.status, "active")))
        .groupBy(animals.groupId);
      return new Map(rows.map((r) => [r.groupId ?? "", r.n]));
    },
  });
}

export async function createGroup(input: { name: string; kind: GroupKind; capacity?: number | null }) {
  const parsed = groupInputSchema.omit({ id: true }).parse(input);
  return insertLocal("groups", { name: parsed.name, kind: parsed.kind, capacity: parsed.capacity ?? null, active: parsed.active });
}

export async function updateGroup(id: string, patch: { name?: string; kind?: GroupKind; capacity?: number | null }) {
  const parsed = groupPatchSchema.parse(patch);
  return updateLocal("groups", id, parsed);
}

export async function renameGroup(id: string, name: string) {
  return updateGroup(id, { name });
}

export async function deleteGroup(id: string, reason?: string) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(animals)
    .where(and(isNull(animals.deletedAt), eq(animals.status, "active"), eq(animals.groupId, id)));
  if (row && row.n > 0) throw new Error(`Grupta ${row.n} hayvan var, önce başka gruba taşı`);
  return softDeleteLocal("groups", id, reason);
}

/** animals.group_id sunucuda trigger ile türer; çevrimdışı için yerelde aynı kural (son silinmemiş hareket). */
async function refreshLocalGroup(animalIds: string[]) {
  const db = getDb();
  for (const animalId of animalIds) {
    const [last] = await db
      .select({ toGroupId: groupMovements.toGroupId })
      .from(groupMovements)
      .where(and(eq(groupMovements.animalId, animalId), isNull(groupMovements.deletedAt)))
      .orderBy(desc(groupMovements.movedAt), desc(groupMovements.createdAt))
      .limit(1);
    if (last) await db.update(animals).set({ groupId: last.toGroupId }).where(eq(animals.id, animalId));
  }
  notifyLocalChange(["animals"]);
}

/**
 * Bir veya çok hayvanı gruba taşır. Zaten hedef grupta olanlar atlanır.
 * Her hayvan için bir hareket kaydı, hepsi tek yerel işlemde ve tek push'ta. Döner: taşınan sayısı.
 */
export async function moveAnimals(input: { animalIds: string[]; toGroupId: string; movedAt: string; reason?: string | null }): Promise<number> {
  if (input.animalIds.length === 0) return 0;
  const rows = await getDb().select({ id: animals.id, groupId: animals.groupId }).from(animals).where(inArray(animals.id, input.animalIds));
  const movements = rows
    .filter((r) => r.groupId !== input.toGroupId)
    .map((r) => groupMovementInputSchema.parse({ id: newId(), animalId: r.id, fromGroupId: r.groupId, toGroupId: input.toGroupId, movedAt: input.movedAt, reason: input.reason ?? null }));
  if (movements.length === 0) return 0;
  await insertManyLocal("group_movements", movements);
  await refreshLocalGroup(movements.map((m) => m.animalId));
  return movements.length;
}
