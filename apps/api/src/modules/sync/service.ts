import {
  REMOVALS_CURSOR,
  softDeletePayloadSchema,
  type AccessTokenClaims,
  type MutationEnvelope,
  type MutationResult,
  type Removal,
  type SyncedTable,
} from "@anka/shared";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ZodError } from "zod";

import type { Db } from "../../db/client";
import {
  animals,
  appliedMutations,
  attachments,
  breedingRecords,
  breeds,
  consumptions,
  exitRecords,
  expenses,
  groupMovements,
  groups,
  healthProtocols,
  healthRecords,
  incomes,
  lambingRecords,
  observationTags,
  observations,
  protocolItems,
  syncRemovals,
  purchases,
  reminders,
  stockItems,
  weightRecords,
} from "../../db/schema";
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
/**
 * Olay zamanı kuralları (bölüm 3.2): iş kuralları kaydın ulaşma zamanına değil, olay zamanına bakar.
 * Sürüden çıkmış hayvana çıkış gününden sonrası için kayıt girilemez; çıkıştan önceki tarihli kayıt,
 * çıkış kaydından sonra ulaşsa bile kabul edilir (telefon günlerce çevrimdışı kalabilir).
 */
const eventDateFields: Partial<Record<SyncedTable, { animal: string; date: string }>> = {
  weight_records: { animal: "animalId", date: "weighedAt" },
  health_records: { animal: "animalId", date: "appliedAt" },
  observations: { animal: "animalId", date: "observedAt" },
  group_movements: { animal: "animalId", date: "movedAt" },
  breeding_records: { animal: "femaleId", date: "matedAt" },
  lambing_records: { animal: "motherId", date: "bornAt" },
};

async function ruleViolation(tx: Tx, user: AccessTokenClaims, table: SyncedTable, fields: Record<string, unknown>): Promise<string | null> {
  const spec = eventDateFields[table];
  if (!spec) return null;
  const animalId = fields[spec.animal];
  const when = fields[spec.date];
  if (typeof animalId !== "string" || typeof when !== "string") return null;

  const [exit] = await tx
    .select({ exitedAt: exitRecords.exitedAt, type: exitRecords.type })
    .from(exitRecords)
    .where(and(eq(exitRecords.animalId, animalId), eq(exitRecords.farmId, user.farmId), isNull(exitRecords.deletedAt)))
    .orderBy(desc(exitRecords.exitedAt))
    .limit(1);
  if (!exit) return null;
  if (when.slice(0, 10) <= exit.exitedAt) return null;

  const day = exit.exitedAt.split("-").reverse().join(".");
  return `Hayvan ${day} tarihinde sürüden çıkmış; sonrasına kayıt girilemez`;
}

async function applyOp(tx: Tx, user: AccessTokenClaims, m: MutationEnvelope): Promise<MutationResult | null> {
  const entry = syncRegistry[m.table];
  // Dinamik tablo katmanı: Drizzle tip çıkarımı tablo başına farklı olduğu için burada gevşek tip kullanılır.
  const table = entry.table as PgTable & { id: any; farmId: any };

  if (m.op === "insert") {
    const parsed = entry.schemas.insert.safeParse({ ...m.payload, id: m.rowId });
    if (!parsed.success) return rejected(m, "VALIDATION", zodMessage(parsed.error));
    const { id: _id, ...fields } = parsed.data as Record<string, unknown>;
    const violation = await ruleViolation(tx, user, m.table, fields);
    if (violation) return rejected(m, "RULE", violation);
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
  // Senkron tabloları ve silinme akışı aynı imleç sözlüğünü paylaşır, o yüzden anahtar düz metin.
  const since = (t: string) => cursors[t] ?? 0;
  const where = (t: { farmId: any; syncSeq: any }, cursor: number) => and(eq(t.farmId, user.farmId), gt(t.syncSeq, cursor));
  // Bakıcı ve veteriner finans satırlarını cihazına hiç almaz (bölüm 2, rol tablosu).
  const finance = user.role === "owner";
  const none = Promise.resolve([] as never[]);

  const [breedRows, groupRows, animalRows, movementRows, weightRows, healthRows, breedingRows, lambingRows, exitRows, obsRows, tagRows, itemRows, purchaseRows, consumptionRows, expenseRows, incomeRows, reminderRows, protocolRows, protocolItemRows, attachmentRows, removalRows] = await Promise.all([
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
    db.select().from(stockItems).where(where(stockItems, since("stock_items"))).orderBy(asc(stockItems.syncSeq)).limit(limit),
    finance ? db.select().from(purchases).where(where(purchases, since("purchases"))).orderBy(asc(purchases.syncSeq)).limit(limit) : none,
    db.select().from(consumptions).where(where(consumptions, since("consumptions"))).orderBy(asc(consumptions.syncSeq)).limit(limit),
    finance ? db.select().from(expenses).where(where(expenses, since("expenses"))).orderBy(asc(expenses.syncSeq)).limit(limit) : none,
    finance ? db.select().from(incomes).where(where(incomes, since("incomes"))).orderBy(asc(incomes.syncSeq)).limit(limit) : none,
    db.select().from(reminders).where(where(reminders, since("reminders"))).orderBy(asc(reminders.syncSeq)).limit(limit),
    db.select().from(healthProtocols).where(where(healthProtocols, since("health_protocols"))).orderBy(asc(healthProtocols.syncSeq)).limit(limit),
    db.select().from(protocolItems).where(where(protocolItems, since("protocol_items"))).orderBy(asc(protocolItems.syncSeq)).limit(limit),
    db.select().from(attachments).where(where(attachments, since("attachments"))).orderBy(asc(attachments.syncSeq)).limit(limit),
    // Silinme akışı: bu çiftlikten tamamen çıkmış satırlar (transfer). Senkron tablosu değil,
    // o yüzden kendi imleciyle ilerler.
    db
      .select({ tableName: syncRemovals.tableName, rowId: syncRemovals.rowId, syncSeq: syncRemovals.syncSeq, reason: syncRemovals.reason })
      .from(syncRemovals)
      .where(and(eq(syncRemovals.farmId, user.farmId), gt(syncRemovals.syncSeq, since(REMOVALS_CURSOR))))
      .orderBy(asc(syncRemovals.syncSeq))
      .limit(limit),
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
      stock_items: itemRows,
      purchases: purchaseRows,
      consumptions: consumptionRows,
      expenses: expenseRows,
      incomes: incomeRows,
      reminders: reminderRows,
      health_protocols: protocolRows,
      protocol_items: protocolItemRows,
      attachments: attachmentRows,
    },
    removals: removalRows as Removal[],
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
      stock_items: last(itemRows, since("stock_items")),
      purchases: last(purchaseRows, since("purchases")),
      consumptions: last(consumptionRows, since("consumptions")),
      expenses: last(expenseRows, since("expenses")),
      incomes: last(incomeRows, since("incomes")),
      reminders: last(reminderRows, since("reminders")),
      health_protocols: last(protocolRows, since("health_protocols")),
      protocol_items: last(protocolItemRows, since("protocol_items")),
      attachments: last(attachmentRows, since("attachments")),
      [REMOVALS_CURSOR]: last(removalRows, since(REMOVALS_CURSOR)),
    } satisfies Record<SyncedTable | typeof REMOVALS_CURSOR, number>,
    hasMore: [breedRows, groupRows, animalRows, movementRows, weightRows, healthRows, breedingRows, lambingRows, exitRows, obsRows, tagRows, itemRows, purchaseRows, consumptionRows, expenseRows, incomeRows, reminderRows, protocolRows, protocolItemRows, attachmentRows, removalRows].some(
      (r) => r.length === limit,
    ),
    serverTime: new Date().toISOString(),
  };
}

/**
 * Bir satırın bu çiftlikten tamamen çıktığını kaydeder; sıradaki pull'da istemci yerel kopyayı siler.
 * Soft delete satırı çiftlikte bıraktığı için bunun yerine geçmez: burada satır artık o çiftliğin
 * pull sorgusuna hiç girmiyor (örneğin transferde farm_id değişti).
 */
export async function recordRemoval(
  tx: Db | Parameters<Parameters<Db["transaction"]>[0]>[0],
  farmId: string,
  tableName: SyncedTable,
  rowId: string,
  reason: string,
) {
  await tx
    .insert(syncRemovals)
    .values({ farmId, tableName, rowId, reason })
    .onConflictDoUpdate({
      target: [syncRemovals.farmId, syncRemovals.tableName, syncRemovals.rowId],
      // Tekrar düşerse imleci geçmiş cihazlar da görsün diye sync_seq tetikleyiciyle yenilenir.
      set: { reason, updatedAt: new Date() },
    });
}
