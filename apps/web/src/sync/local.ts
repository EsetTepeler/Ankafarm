import type { MutationOp } from "@anka/shared";
import { eq, inArray } from "drizzle-orm";

import { withLocalTransaction, type LocalDb } from "@/db";
import { localTables, outbox, type LocalTableName } from "@/db/schema";
import { useAuthStore } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";

import { notifyLocalChange } from "./events";
import { scheduleSync } from "./worker";

type Row<T extends LocalTableName> = (typeof localTables)[T]["$inferInsert"];
type NewRow<T extends LocalTableName> = Omit<Row<T>, "id" | "farmId" | "createdAt" | "updatedAt" | "createdBy" | "syncSeq"> & { id?: string };

function requireUser() {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("Oturum yok");
  return user;
}

async function enqueue(db: LocalDb, table: LocalTableName, op: MutationOp, rowId: string, payload: Record<string, unknown>) {
  await db.insert(outbox).values({
    mutationId: newId(),
    table,
    op,
    rowId,
    payload,
    clientCreatedAt: nowIso(),
  });
}

/**
 * Her yazma önce yerel tabloya, sonra outbox'a; hepsi tek işlemde (bölüm 9).
 * Toplu işlemler (örn. sürünün tamamına aşı) tek işlemde yazılır, sunucuya tek push'ta gider.
 */
export async function insertManyLocal<T extends LocalTableName>(table: T, rows: NewRow<T>[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const user = requireUser();
  const now = nowIso();
  const ids: string[] = [];
  await withLocalTransaction(async (db) => {
    for (const fields of rows) {
      const id = fields.id ?? newId();
      ids.push(id);
      const row = { ...fields, id, farmId: user.farmId, createdAt: now, updatedAt: now, createdBy: user.id, syncSeq: 0 };
      await db.insert(localTables[table]).values(row as any);
      const { id: _id, farmId: _f, createdAt: _c, updatedAt: _u, createdBy: _b, syncSeq: _s, ...payload } = row;
      await enqueue(db, table, "insert", id, payload);
    }
  });
  notifyLocalChange([table]);
  scheduleSync("local-write");
  return ids;
}

export async function insertLocal<T extends LocalTableName>(table: T, fields: NewRow<T>): Promise<string> {
  const [id] = await insertManyLocal(table, [fields]);
  return id!;
}

export async function updateLocal<T extends LocalTableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<void> {
  requireUser();
  const now = nowIso();
  await withLocalTransaction(async (db) => {
    const t = localTables[table] as any;
    await db.update(t).set({ ...patch, updatedAt: now }).where(eq(t.id, id));
    await enqueue(db, table, "update", id, patch as Record<string, unknown>);
  });
  notifyLocalChange([table]);
  scheduleSync("local-write");
}

export async function softDeleteManyLocal(table: LocalTableName, ids: string[], reason?: string): Promise<void> {
  if (ids.length === 0) return;
  const user = requireUser();
  const now = nowIso();
  await withLocalTransaction(async (db) => {
    const t = localTables[table] as any;
    await db.update(t).set({ deletedAt: now, deletedBy: user.id, deleteReason: reason ?? null, updatedAt: now }).where(inArray(t.id, ids));
    for (const id of ids) await enqueue(db, table, "soft_delete", id, { reason: reason ?? null });
  });
  notifyLocalChange([table]);
  scheduleSync("local-write");
}

export async function softDeleteLocal(table: LocalTableName, id: string, reason?: string): Promise<void> {
  return softDeleteManyLocal(table, [id], reason);
}
