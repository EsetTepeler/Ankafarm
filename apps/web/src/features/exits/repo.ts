import { exitInputSchema, statusFromExit, type ExitType } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, exitRecords } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey, notifyLocalChange } from "@/sync/events";
import { insertManyLocal, softDeleteManyLocal } from "@/sync/local";

export function useExits(animalId: string | undefined) {
  return useQuery({
    queryKey: localKey("exit_records", animalId ?? ""),
    enabled: !!animalId,
    queryFn: () =>
      getDb()
        .select()
        .from(exitRecords)
        .where(and(eq(exitRecords.animalId, animalId!), isNull(exitRecords.deletedAt)))
        .orderBy(desc(exitRecords.exitedAt)),
  });
}

/** animals.status sunucuda trigger ile türer; çevrimdışı için yerelde aynı kural. */
async function refreshLocalStatus(animalId: string) {
  const db = getDb();
  const [last] = await db
    .select({ type: exitRecords.type })
    .from(exitRecords)
    .where(and(eq(exitRecords.animalId, animalId), isNull(exitRecords.deletedAt)))
    .orderBy(desc(exitRecords.exitedAt), desc(exitRecords.createdAt))
    .limit(1);
  await db
    .update(animals)
    .set({ status: last ? statusFromExit(last.type as ExitType) : "active" })
    .where(eq(animals.id, animalId));
  notifyLocalChange(["animals"]);
}

export async function addExit(input: { animalId: string; type: ExitType; exitedAt: string; reason?: string | null; price?: number | null; buyer?: string | null; notes?: string | null }): Promise<string> {
  const parsed = exitInputSchema.parse({ id: newId(), ...input });
  const [id] = await insertManyLocal("exit_records", [parsed]);
  await refreshLocalStatus(input.animalId);
  return id!;
}

/** Çıkışı geri al: hayvan yeniden aktif olur. */
export async function undoExit(id: string, animalId: string) {
  await softDeleteManyLocal("exit_records", [id], "çıkış geri alındı");
  await refreshLocalStatus(animalId);
}
