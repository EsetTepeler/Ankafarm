import {
  softDeletePayloadSchema,
  type AccessTokenClaims,
  type MutationEnvelope,
  type MutationResult,
  type SyncedTable,
} from "@anka/shared";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ZodError } from "zod";

import type { Db } from "../../db/client";
import { animals, appliedMutations, breedingRecords, breeds, exitRecords, groupMovements, groups, healthRecords, lambingRecords, observationTags, observations, weightRecords } from "../../db/schema";
import { afterInsertHooks } from "./hooks";
import { deleteRoles, syncRegistry } from "./registry";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function rejected(m: MutationEnvelope, code: Extract<MutationResult, { status: "rejected" }>["code"], message: string): MutationResult {
  return { mutationId: m.mutationId, status: "rejected", code, message };
}

function zodMessage(err: ZodError): string {
  return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

/**
 * Her mutasyon kendi işleminde uygulanır: biri reddedilirse diğerleri etkilenmez.
 * Aynı mutation_id ikinci kez gelirse "duplicate" döner, hiçbir şey yazılmaz.
 * Son yazan kazanır; kaybeden değer audit_log'da kalır (trigger).
 */
export async function pushMutations(db: Db, user: AccessTokenClaims, mutations: MutationEnvelope[]): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const m of mutations) {
    results.push(await applyOne(db, user, m));
  }
  return results;
}

async function applyOne(db: Db, user: AccessTokenClaims, m: MutationEnvelope): Promise<MutationResult> {
  const entry = syncRegistry[m.table];
  if (!entry.writers.includes(user.role)) {
    return rejected(m, "FORBIDDEN", "Bu tabloya yazma yetkiniz yok");
  }
  if (m.op === "soft_delete" && !deleteRoles.includes(user.role)) {
    return rejected(m, "FORBIDDEN", "Silme sadece çiftlik sahibine açık");
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${user.sub}, true), set_config('app.mutation_id', ${m.mutationId}, true)`,
      );

      const [dup] = await tx
        .select({ id: appliedMutations.mutationId })
        .from(appliedMutations)
        .where(eq(appliedMutations.mutationId, m.mutationId))
        .limit(1);
      if (dup) return { mutationId: m.mutationId, status: "duplicate" };

      const outcome = await applyOp(tx, user, m);
      if (outcome) return outcome;

      await tx.insert(appliedMutations).values({ mutationId: m.mutationId, farmId: user.farmId, userId: user.sub });
      return { mutationId: m.mutationId, status: "applied" };
    });
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === "23505") return rejected(m, "CONFLICT", "Aynı değerde bir kayıt zaten var (örneğin küpe numarası)");
    if (code === "23503") return rejected(m, "CONFLICT", "Bağlı kayıt bulunamadı (grup, ırk, anne veya baba)");
    if (code === "22P02" || code === "22007" || code === "22008") return rejected(m, "VALIDATION", "Geçersiz değer biçimi");
    throw err;
  }
}

/** Tek bir işlemi uygular; sorun varsa red sonucu döner, yoksa null. */
async function applyOp(tx: Tx, user: AccessTokenClaims, m: MutationEnvelope): Promise<MutationResult | null> {
  const entry = syncRegistry[m.table];
  // Dinamik tablo katmanı: Drizzle tip çıkarımı tablo başına farklı olduğu için burada gevşek tip kullanılır.
  const table = entry.table as PgTable & { id: any; farmId: any };

  if (m.op === "insert") {
    const parsed = entry.schemas.insert.safeParse({ ...m.payload, id: m.rowId });
    if (!parsed.success) return rejected(m, "VALIDATION", zodMessage(parsed.error));
    const { id: _id, ...fields } = parsed.data as Record<string, unknown>;
    const values = {
      ...fields,
      id: m.rowId,
      farmId: user.farmId,
      createdBy: user.sub,
      recordedAt: m.clientCreatedAt,
    };
    // Aynı id ile tekrar gelirse güncelle (istemci yeniden gönderdi, farklı mutation_id ile).
    await tx
      .insert(table)
      .values(values as any)
      .onConflictDoUpdate({ target: table.id, set: fields as any, setWhere: eq(table.farmId, user.farmId) });
    // Tablo bazlı türev işler: örneğin çiftleşme → doğum tahmini, doğum → tahminin değerlendirilmesi.
    const hook = afterInsertHooks[m.table];
    if (hook) await hook(tx, user, m.rowId, fields);
    return null;
  }

  if (m.op === "update") {
    const parsed = entry.schemas.update.safeParse(m.payload);
    if (!parsed.success) return rejected(m, "VALIDATION", zodMessage(parsed.error));
    const fields = parsed.data as Record<string, unknown>;
    if (Object.keys(fields).length === 0) return rejected(m, "VALIDATION", "Güncellenecek alan yok");
    const updated = await tx
      .update(table)
      .set(fields as any)
      .where(and(eq(table.id, m.rowId), eq(table.farmId, user.farmId)))
      .returning({ id: table.id });
    if (updated.length === 0) return rejected(m, "NOT_FOUND", "Kayıt bulunamadı");
    return null;
  }

  const parsed = softDeletePayloadSchema.safeParse(m.payload);
  if (!parsed.success) return rejected(m, "VALIDATION", zodMessage(parsed.error));
  const deleted = await tx
    .update(table)
    .set({ deletedAt: new Date(), deletedBy: user.sub, deleteReason: parsed.data.reason ?? null } as any)
    .where(and(eq(table.id, m.rowId), eq(table.farmId, user.farmId)))
    .returning({ id: table.id });
  if (deleted.length === 0) return rejected(m, "NOT_FOUND", "Kayıt bulunamadı");
  return null;
}

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" ? code : undefined;
}

/** Tablo başına imleçten sonraki satırlar, sync_seq sırasıyla. Silinmişler de gelir (deleted_at dolu). */
export async function pullChanges(db: Db, user: AccessTokenClaims, cursors: Record<string, number>, limit: number) {
  const since = (t: SyncedTable) => cursors[t] ?? 0;
  const where = (t: { farmId: any; syncSeq: any }, cursor: number) => and(eq(t.farmId, user.farmId), gt(t.syncSeq, cursor));

  const [breedRows, groupRows, animalRows, movementRows, weightRows, healthRows, breedingRows, lambingRows, exitRows, obsRows, tagRows] = await Promise.all([
    db.select().from(breeds).where(where(breeds, since("breeds"))).orderBy(asc(breeds.syncSeq)).limit(limit),
    db.select().from(groups).where(where(groups, since("groups"))).orderBy(asc(groups.syncSeq)).limit(limit),
    db.select().from(animals).where(where(animals, since("animals"))).orderBy(asc(animals.syncSeq)).limit(limit),
    db
      .select()
      .from(groupMovements)
      .where(where(groupMovements, since("group_movements")))
      .orderBy(asc(groupMovements.syncSeq))
      .limit(limit),
    db
      .select()
      .from(weightRecords)
      .where(where(weightRecords, since("weight_records")))
      .orderBy(asc(weightRecords.syncSeq))
      .limit(limit),
    db
      .select()
      .from(healthRecords)
      .where(where(healthRecords, since("health_records")))
      .orderBy(asc(healthRecords.syncSeq))
      .limit(limit),
    db
      .select()
      .from(breedingRecords)
      .where(where(breedingRecords, since("breeding_records")))
      .orderBy(asc(breedingRecords.syncSeq))
      .limit(limit),
    db
      .select()
      .from(lambingRecords)
      .where(where(lambingRecords, since("lambing_records")))
      .orderBy(asc(lambingRecords.syncSeq))
      .limit(limit),
    db.select().from(exitRecords).where(where(exitRecords, since("exit_records"))).orderBy(asc(exitRecords.syncSeq)).limit(limit),
    db.select().from(observations).where(where(observations, since("observations"))).orderBy(asc(observations.syncSeq)).limit(limit),
    db.select().from(observationTags).where(where(observationTags, since("observation_tags"))).orderBy(asc(observationTags.syncSeq)).limit(limit),
  ]);

  const last = (rows: { syncSeq: number }[], fallback: number) => (rows.length ? rows[rows.length - 1]!.syncSeq : fallback);

  return {
    tables: {
      breeds: breedRows,
      groups: groupRows,
      animals: animalRows,
      group_movements: movementRows,
      weight_records: weightRows,
      health_records: healthRows,
      breeding_records: breedingRows,
      lambing_records: lambingRows,
      exit_records: exitRows,
      observations: obsRows,
      observation_tags: tagRows,
    },
    cursors: {
      breeds: last(breedRows, since("breeds")),
      groups: last(groupRows, since("groups")),
      animals: last(animalRows, since("animals")),
      group_movements: last(movementRows, since("group_movements")),
      weight_records: last(weightRows, since("weight_records")),
      health_records: last(healthRows, since("health_records")),
      breeding_records: last(breedingRows, since("breeding_records")),
      lambing_records: last(lambingRows, since("lambing_records")),
      exit_records: last(exitRows, since("exit_records")),
      observations: last(obsRows, since("observations")),
      observation_tags: last(tagRows, since("observation_tags")),
    } satisfies Record<SyncedTable, number>,
    hasMore: [breedRows, groupRows, animalRows, movementRows, weightRows, healthRows, breedingRows, lambingRows, exitRows, obsRows, tagRows].some((r) => r.length === limit),
    serverTime: new Date().toISOString(),
  };
}
