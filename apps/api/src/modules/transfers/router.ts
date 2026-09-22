import { acceptTransferInputSchema, DEFAULT_GROUP_NAME, requestTransferInputSchema, type AnimalProvenance } from "@anka/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { animals, animalTransfers, breeds, farms, groups, healthRecords, weightRecords } from "../../db/schema";
import { ownerProcedure, protectedProcedure, router } from "../../trpc/init";
import type { Db } from "../../db/client";
import { recordRemoval } from "../sync/service";

/** Transaction tipi: Drizzle bunu dışa vermediği için transaction geri çağrısından türetilir. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Devir bilgisi iki çiftliği de ilgilendiriyor; karşı tarafın adı ve kodu listede görünür. */
const transferSelect = {
  id: animalTransfers.id,
  animalId: animalTransfers.animalId,
  fromFarmId: animalTransfers.fromFarmId,
  toFarmId: animalTransfers.toFarmId,
  tagNo: animalTransfers.tagNo,
  newTagNo: animalTransfers.newTagNo,
  status: animalTransfers.status,
  note: animalTransfers.note,
  decisionNote: animalTransfers.decisionNote,
  requestedAt: animalTransfers.requestedAt,
  decidedAt: animalTransfers.decidedAt,
};

/**
 * Çiftlikler arası hayvan devri (7.5). Sunucuda yaşar, cihaza senkron edilmez:
 * iki kiracıya birden dokunduğu için çevrimdışı karar verilemez.
 */
export const transfersRouter = router({
  /** Bu çiftliğe gelen istekler; karşı çiftliğin adıyla. */
  incoming: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ ...transferSelect, otherFarmName: farms.name, otherFarmCode: farms.code })
      .from(animalTransfers)
      .innerJoin(farms, eq(farms.id, animalTransfers.fromFarmId))
      .where(eq(animalTransfers.toFarmId, ctx.user.farmId))
      .orderBy(desc(animalTransfers.requestedAt))
      .limit(100),
  ),

  /** Bu çiftlikten gönderilen istekler. */
  outgoing: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ ...transferSelect, otherFarmName: farms.name, otherFarmCode: farms.code })
      .from(animalTransfers)
      .innerJoin(farms, eq(farms.id, animalTransfers.toFarmId))
      .where(eq(animalTransfers.fromFarmId, ctx.user.farmId))
      .orderBy(desc(animalTransfers.requestedAt))
      .limit(100),
  ),

  /** Hedef çiftliği koduyla doğrular; ad aranabilir değil, kodu karşı taraf paylaşır. */
  request: ownerProcedure.input(requestTransferInputSchema).mutation(async ({ ctx, input }) => {
    const [animal] = await ctx.db
      .select({ id: animals.id, tagNo: animals.tagNo, status: animals.status })
      .from(animals)
      .where(and(eq(animals.id, input.animalId), eq(animals.farmId, ctx.user.farmId), isNull(animals.deletedAt)))
      .limit(1);
    if (!animal) throw new TRPCError({ code: "NOT_FOUND", message: "Hayvan bulunamadı" });
    if (animal.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Sürüden çıkmış hayvan devredilemez" });

    const [target] = await ctx.db
      .select({ id: farms.id, name: farms.name, status: farms.status })
      .from(farms)
      .where(and(eq(farms.code, input.toFarmCode), ne(farms.id, ctx.user.farmId)))
      .limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Bu koda sahip başka bir çiftlik yok" });
    if (target.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Hedef çiftlik askıya alınmış" });

    const [pending] = await ctx.db
      .select({ id: animalTransfers.id })
      .from(animalTransfers)
      .where(and(eq(animalTransfers.animalId, animal.id), eq(animalTransfers.status, "pending")))
      .limit(1);
    if (pending) throw new TRPCError({ code: "CONFLICT", message: "Bu hayvan için bekleyen bir devir isteği zaten var" });

    const [created] = await ctx.db
      .insert(animalTransfers)
      .values({
        animalId: animal.id,
        fromFarmId: ctx.user.farmId,
        toFarmId: target.id,
        tagNo: animal.tagNo,
        note: input.note ?? null,
        requestedBy: ctx.user.sub,
      })
      .returning();
    return { ...created, toFarmName: target.name };
  }),

  cancel: ownerProcedure.input(z.object({ transferId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(animalTransfers)
      .set({ status: "cancelled", decidedAt: new Date(), decidedBy: ctx.user.sub, updatedAt: new Date() })
      .where(and(eq(animalTransfers.id, input.transferId), eq(animalTransfers.fromFarmId, ctx.user.farmId), eq(animalTransfers.status, "pending")))
      .returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Bekleyen devir bulunamadı" });
    return updated;
  }),

  reject: ownerProcedure.input(z.object({ transferId: z.string().uuid(), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(animalTransfers)
      .set({ status: "rejected", decisionNote: input.note ?? null, decidedAt: new Date(), decidedBy: ctx.user.sub, updatedAt: new Date() })
      .where(and(eq(animalTransfers.id, input.transferId), eq(animalTransfers.toFarmId, ctx.user.farmId), eq(animalTransfers.status, "pending")))
      .returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Bekleyen devir bulunamadı" });
    return updated;
  }),

  /**
   * Kabul: hayvan ve bakım geçmişi B'ye taşınır, A'nın cihazlarına silinme kaydı düşer.
   * Taşınanlar: hayvan, sağlık ve tartım kayıtları. A'da kalanlar: gözlemler, çiftleşme ve
   * doğum kayıtları, ekler, grup hareketleri, gider ve gelir — çünkü bunlar A'nın kendi geçmişi
   * ve parası. Sağlık kayıtlarının maliyeti de bu yüzden boşaltılır.
   */
  accept: ownerProcedure.input(acceptTransferInputSchema).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      const [transfer] = await tx
        .select()
        .from(animalTransfers)
        .where(and(eq(animalTransfers.id, input.transferId), eq(animalTransfers.toFarmId, ctx.user.farmId), eq(animalTransfers.status, "pending")))
        .limit(1);
      if (!transfer) throw new TRPCError({ code: "NOT_FOUND", message: "Bekleyen devir bulunamadı" });

      const [animal] = await tx
        .select()
        .from(animals)
        .where(and(eq(animals.id, transfer.animalId), eq(animals.farmId, transfer.fromFarmId), isNull(animals.deletedAt)))
        .limit(1);
      if (!animal) throw new TRPCError({ code: "BAD_REQUEST", message: "Hayvan kaynak çiftlikte bulunamadı, devir geçersiz" });

      const tagNo = input.newTagNo?.trim() || animal.tagNo;
      const [clash] = await tx
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.farmId, ctx.user.farmId), eq(animals.tagNo, tagNo), isNull(animals.deletedAt)))
        .limit(1);
      if (clash) {
        throw new TRPCError({ code: "CONFLICT", message: `${tagNo} küpesi bu çiftlikte kullanılıyor, başka bir küpe ver` });
      }

      // Irk ve grup çiftliğe özel satırlar; B'de karşılığı bulunur, yoksa açılır.
      const breedId = animal.breedId ? await mapBreed(tx, animal.breedId, ctx.user.farmId, ctx.user.sub) : null;
      const groupId = await defaultGroup(tx, ctx.user.farmId, ctx.user.sub);

      // Anne ve baba A'da kalıyor; kimlik bağı çiftlik sınırını geçmesin diye küpeleri metne alınır.
      const parentIds = [animal.motherId, animal.fatherId].filter((x): x is string => !!x);
      const parents = parentIds.length
        ? await tx.select({ id: animals.id, tagNo: animals.tagNo }).from(animals).where(inArray(animals.id, parentIds))
        : [];
      const tagOf = (id: string | null) => (id ? (parents.find((p) => p.id === id)?.tagNo ?? null) : null);

      const [fromFarm] = await tx.select({ name: farms.name, code: farms.code }).from(farms).where(eq(farms.id, transfer.fromFarmId)).limit(1);
      const today = new Date().toISOString().slice(0, 10);
      const provenance: AnimalProvenance = {
        fromFarmName: fromFarm?.name ?? "",
        fromFarmCode: fromFarm?.code ?? "",
        transferredAt: today,
        previousTagNo: animal.tagNo,
        motherTagNo: tagOf(animal.motherId),
        fatherTagNo: tagOf(animal.fatherId),
      };

      await tx
        .update(animals)
        .set({
          farmId: ctx.user.farmId,
          tagNo,
          breedId,
          groupId,
          motherId: null,
          fatherId: null,
          origin: "purchased",
          acquiredAt: today,
          source: fromFarm?.name ?? null,
          // Satın alma bedeli A'nın kaydı; alıcı kendi ödediğini ayrıca girer.
          purchasePrice: null,
          provenance,
          updatedAt: new Date(),
        })
        .where(eq(animals.id, animal.id));

      // Bakım geçmişi hayvanla gider; sağlık kaydının maliyeti A'nın gideri olduğu için düşer.
      const movedHealth = await tx
        .update(healthRecords)
        .set({ farmId: ctx.user.farmId, cost: null, updatedAt: new Date() })
        .where(eq(healthRecords.animalId, animal.id))
        .returning({ id: healthRecords.id });
      const movedWeights = await tx
        .update(weightRecords)
        .set({ farmId: ctx.user.farmId, updatedAt: new Date() })
        .where(eq(weightRecords.animalId, animal.id))
        .returning({ id: weightRecords.id });

      // A'nın cihazları satırı bir daha pull edemez; silmesi söylenmeli.
      const reason = `Devir: ${ctx.user.farmId}`;
      await recordRemoval(tx, transfer.fromFarmId, "animals", animal.id, reason);
      for (const row of movedHealth) await recordRemoval(tx, transfer.fromFarmId, "health_records", row.id, reason);
      for (const row of movedWeights) await recordRemoval(tx, transfer.fromFarmId, "weight_records", row.id, reason);

      const [updated] = await tx
        .update(animalTransfers)
        .set({
          status: "accepted",
          newTagNo: tagNo === transfer.tagNo ? null : tagNo,
          decisionNote: input.note ?? null,
          decidedAt: new Date(),
          decidedBy: ctx.user.sub,
          updatedAt: new Date(),
        })
        .where(eq(animalTransfers.id, transfer.id))
        .returning();
      return { ...updated, tagNo, movedHealth: movedHealth.length, movedWeights: movedWeights.length };
    }),
  ),
});

/** Kaynak ırkın adını hedef çiftlikte bulur, yoksa aynı adla açar. */
async function mapBreed(tx: Tx, sourceBreedId: string, farmId: string, userId: string): Promise<string | null> {
  const [source] = await tx.select({ name: breeds.name, species: breeds.species }).from(breeds).where(eq(breeds.id, sourceBreedId)).limit(1);
  if (!source) return null;
  const [existing] = await tx
    .select({ id: breeds.id })
    .from(breeds)
    .where(and(eq(breeds.farmId, farmId), eq(breeds.name, source.name), eq(breeds.species, source.species), isNull(breeds.deletedAt)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(breeds).values({ farmId, name: source.name, species: source.species, createdBy: userId }).returning({ id: breeds.id });
  return created?.id ?? null;
}

/** Devredilen hayvan hedef çiftliğin ana sürüsüne girer; yoksa grup açılır. */
async function defaultGroup(tx: Tx, farmId: string, userId: string): Promise<string | null> {
  const [existing] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.farmId, farmId), eq(groups.name, DEFAULT_GROUP_NAME), isNull(groups.deletedAt)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(groups).values({ farmId, name: DEFAULT_GROUP_NAME, kind: "pen", createdBy: userId }).returning({ id: groups.id });
  return created?.id ?? null;
}
