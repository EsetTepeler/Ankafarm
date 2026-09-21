import {
  consumptionInputSchema,
  CONSUMPTION_WINDOW_DAYS,
  daysOfStockLeft,
  purchaseInputSchema,
  resolvePurchaseAmounts,
  stockBalance,
  stockItemInputSchema,
  stockItemPatchSchema,
  type ConsumptionInput,
  type PurchaseInput,
  type StockCategory,
  type StockUnit,
} from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { consumptions, purchases, stockItems, type LocalStockItem } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertLocal, insertManyLocal, softDeleteLocal, updateLocal } from "@/sync/local";
import { todayIso } from "@/utils/date";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useStockItems(opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: localKey("stock_items", opts?.activeOnly ?? false),
    queryFn: () =>
      getDb()
        .select()
        .from(stockItems)
        .where(opts?.activeOnly ? and(isNull(stockItems.deletedAt), eq(stockItems.active, true)) : isNull(stockItems.deletedAt))
        .orderBy(stockItems.category, stockItems.name),
  });
}

export interface StockLevel extends LocalStockItem {
  purchased: number;
  consumed: number;
  /** Takip edilmeyen kalemde (yağmur suyu) null. */
  balance: number | null;
  consumedInWindow: number;
  daysLeft: number | null;
  belowMin: boolean;
  spent: number;
}

/**
 * Kalem bazında bakiye ve kalan gün; sunucudaki v_stock_levels ile aynı hesap (shared/stock.ts).
 * Anahtar "stock_items": kalem, alım veya tüketim değişince tazelenir (aşağıdaki yazmalar üçünü de bildirir).
 */
export function useStockLevels() {
  return useQuery({
    queryKey: localKey("stock_items", "levels"),
    queryFn: async (): Promise<StockLevel[]> => {
      const db = getDb();
      const windowStart = addDays(todayIso(), -CONSUMPTION_WINDOW_DAYS);
      const [items, bought, used, recent] = await Promise.all([
        db.select().from(stockItems).where(isNull(stockItems.deletedAt)).orderBy(stockItems.category, stockItems.name),
        db
          .select({ itemId: purchases.itemId, qty: sql<number>`sum(${purchases.quantity})`, spent: sql<number>`sum(coalesce(${purchases.total}, 0))` })
          .from(purchases)
          .where(isNull(purchases.deletedAt))
          .groupBy(purchases.itemId),
        db
          .select({ itemId: consumptions.itemId, qty: sql<number>`sum(${consumptions.quantity})` })
          .from(consumptions)
          .where(isNull(consumptions.deletedAt))
          .groupBy(consumptions.itemId),
        db
          .select({ itemId: consumptions.itemId, qty: sql<number>`sum(${consumptions.quantity})` })
          .from(consumptions)
          .where(and(isNull(consumptions.deletedAt), gte(consumptions.consumedOn, windowStart)))
          .groupBy(consumptions.itemId),
      ]);
      const boughtMap = new Map(bought.map((r) => [r.itemId, r]));
      const usedMap = new Map(used.map((r) => [r.itemId, r.qty ?? 0]));
      const recentMap = new Map(recent.map((r) => [r.itemId, r.qty ?? 0]));
      return items.map((item) => {
        const purchased = boughtMap.get(item.id)?.qty ?? 0;
        const consumed = usedMap.get(item.id) ?? 0;
        const consumedInWindow = recentMap.get(item.id) ?? 0;
        const balance = stockBalance({ trackStock: item.trackStock, purchased, consumed });
        return {
          ...item,
          purchased,
          consumed,
          balance,
          consumedInWindow,
          daysLeft: daysOfStockLeft(balance, consumedInWindow, CONSUMPTION_WINDOW_DAYS),
          belowMin: balance != null && item.minStock != null && balance < item.minStock,
          spent: boughtMap.get(item.id)?.spent ?? 0,
        };
      });
    },
  });
}

export function usePurchases(itemId?: string) {
  return useQuery({
    queryKey: localKey("purchases", itemId ?? "all"),
    queryFn: () =>
      getDb()
        .select({ purchase: purchases, itemName: stockItems.name, unit: stockItems.unit })
        .from(purchases)
        .innerJoin(stockItems, eq(stockItems.id, purchases.itemId))
        .where(itemId ? and(isNull(purchases.deletedAt), eq(purchases.itemId, itemId)) : isNull(purchases.deletedAt))
        .orderBy(desc(purchases.purchasedAt), desc(purchases.createdAt))
        .limit(100),
  });
}

export function useConsumptions(itemId?: string) {
  return useQuery({
    queryKey: localKey("consumptions", itemId ?? "all"),
    queryFn: () =>
      getDb()
        .select({ consumption: consumptions, itemName: stockItems.name, unit: stockItems.unit })
        .from(consumptions)
        .innerJoin(stockItems, eq(stockItems.id, consumptions.itemId))
        .where(itemId ? and(isNull(consumptions.deletedAt), eq(consumptions.itemId, itemId)) : isNull(consumptions.deletedAt))
        .orderBy(desc(consumptions.consumedOn), desc(consumptions.createdAt))
        .limit(200),
  });
}

/** "Dünkü gibi": en son tüketim girilen günün kalem başına miktarları. */
export function useLastConsumptionDay() {
  return useQuery({
    queryKey: localKey("consumptions", "lastDay"),
    queryFn: async (): Promise<{ day: string; byItem: Record<string, number> } | null> => {
      const db = getDb();
      const [last] = await db
        .select({ day: consumptions.consumedOn })
        .from(consumptions)
        .where(isNull(consumptions.deletedAt))
        .orderBy(desc(consumptions.consumedOn))
        .limit(1);
      if (!last) return null;
      const rows = await db
        .select({ itemId: consumptions.itemId, qty: sql<number>`sum(${consumptions.quantity})` })
        .from(consumptions)
        .where(and(isNull(consumptions.deletedAt), eq(consumptions.consumedOn, last.day)))
        .groupBy(consumptions.itemId);
      return { day: last.day, byItem: Object.fromEntries(rows.map((r) => [r.itemId, r.qty ?? 0])) };
    },
  });
}

export async function createStockItem(input: { name: string; category: StockCategory; unit: StockUnit; minStock?: number | null; trackStock?: boolean }) {
  const parsed = stockItemInputSchema.omit({ id: true }).parse(input);
  return insertLocal("stock_items", {
    name: parsed.name,
    category: parsed.category,
    unit: parsed.unit,
    minStock: parsed.minStock ?? null,
    trackStock: parsed.trackStock,
    active: parsed.active,
    notes: parsed.notes ?? null,
  });
}

export async function updateStockItem(id: string, patch: { name?: string; category?: StockCategory; unit?: StockUnit; minStock?: number | null; trackStock?: boolean; active?: boolean }) {
  return updateLocal("stock_items", id, stockItemPatchSchema.parse(patch));
}

export async function deleteStockItem(id: string) {
  const db = getDb();
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(consumptions)
    .where(and(isNull(consumptions.deletedAt), eq(consumptions.itemId, id)));
  const [bought] = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchases)
    .where(and(isNull(purchases.deletedAt), eq(purchases.itemId, id)));
  if ((used?.n ?? 0) + (bought?.n ?? 0) > 0) throw new Error("Bu kalemin kayıtları var; silmek yerine pasife al");
  return softDeleteLocal("stock_items", id);
}

/** Alım: birim fiyat veya toplamdan diğeri türetilir (sunucuda aynı trigger). */
export async function addPurchase(input: Omit<PurchaseInput, "id">): Promise<string> {
  const amounts = resolvePurchaseAmounts(input);
  const parsed = purchaseInputSchema.parse({ id: newId(), ...input, ...amounts });
  return insertLocal("purchases", {
    itemId: parsed.itemId,
    purchasedAt: parsed.purchasedAt,
    quantity: parsed.quantity,
    unitPrice: parsed.unitPrice ?? null,
    total: parsed.total ?? null,
    supplier: parsed.supplier ?? null,
    documentPath: null,
    notes: parsed.notes ?? null,
  });
}

/** Günlük tur: birden çok kalem tek işlemde, tek push. */
export async function addConsumptions(rows: Omit<ConsumptionInput, "id">[]): Promise<number> {
  const parsed = rows.map((r) => consumptionInputSchema.parse({ id: newId(), ...r }));
  if (parsed.length === 0) return 0;
  await insertManyLocal(
    "consumptions",
    parsed.map((p) => ({
      itemId: p.itemId,
      consumedOn: p.consumedOn,
      quantity: p.quantity,
      groupId: p.groupId ?? null,
      animalId: p.animalId ?? null,
      notes: p.notes ?? null,
    })),
  );
  return parsed.length;
}

export async function deletePurchase(id: string) {
  return softDeleteLocal("purchases", id);
}

export async function deleteConsumption(id: string) {
  return softDeleteLocal("consumptions", id);
}
