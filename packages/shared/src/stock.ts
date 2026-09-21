import { z } from "zod";

import { formatNumber, isoDateSchema, moneySchema, quantitySchema, uuidSchema } from "./common";

export const stockCategorySchema = z.enum(["feed", "water", "medicine", "supply", "other"]);
export type StockCategory = z.infer<typeof stockCategorySchema>;

export const stockUnitSchema = z.enum(["kg", "bale", "liter", "bucket", "m3", "piece"]);
export type StockUnit = z.infer<typeof stockUnitSchema>;

export const expenseCategorySchema = z.enum(["animal_purchase", "feed", "water", "electricity", "labor", "vet", "fuel", "equipment", "rent", "tax", "other"]);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const incomeCategorySchema = z.enum(["animal_sale", "milk", "wool", "manure", "subsidy", "other"]);
export type IncomeCategory = z.infer<typeof incomeCategorySchema>;

/** Türkçe etiketler; `labels` içine karışır (packages/shared/animals.ts). */
export const stockLabels = {
  stockCategory: { feed: "Yem", water: "Su", medicine: "İlaç", supply: "Malzeme", other: "Diğer" },
  stockUnit: { kg: "kg", bale: "balya", liter: "litre", bucket: "kova", m3: "m³", piece: "adet" },
  expenseCategory: {
    animal_purchase: "Hayvan alımı",
    feed: "Yem",
    water: "Su",
    electricity: "Elektrik",
    labor: "İşçilik",
    vet: "Veteriner",
    fuel: "Yakıt",
    equipment: "Ekipman",
    rent: "Kira",
    tax: "Vergi",
    other: "Diğer",
  },
  incomeCategory: { animal_sale: "Hayvan satışı", milk: "Süt", wool: "Yapağı", manure: "Gübre", subsidy: "Destekleme", other: "Diğer" },
} as const;

/** Miktar ve birim: "500 kg", "12,5 balya". */
export function formatQuantity(quantity: number, unit: StockUnit | string): string {
  const label = stockLabels.stockUnit[unit as StockUnit] ?? unit;
  return `${formatNumber(quantity)} ${label}`;
}

export const stockItemInputSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, "Kalem adı gerekli").max(80),
  category: stockCategorySchema,
  unit: stockUnitSchema,
  /** Bu seviyenin altına düşünce uyarı. */
  minStock: z.number().nonnegative().max(1_000_000).nullable().optional(),
  /** false ise bakiye tutulmaz, sadece tüketim sayılır (yağmur suyu gibi). */
  trackStock: z.boolean().default(true),
  active: z.boolean().default(true),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type StockItemInput = z.infer<typeof stockItemInputSchema>;
export const stockItemPatchSchema = stockItemInputSchema.omit({ id: true }).partial();

/** Alım: stoğa giriş ve aynı zamanda gider. */
export const purchaseInputSchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
  purchasedAt: isoDateSchema,
  quantity: quantitySchema,
  unitPrice: moneySchema.nullable().optional(),
  total: moneySchema.nullable().optional(),
  supplier: z.string().trim().max(120).nullable().optional(),
  documentPath: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export const purchasePatchSchema = purchaseInputSchema.omit({ id: true, itemId: true }).partial();

/** Tüketim: stoktan çıkış. Grup boşsa tüm çiftlik, hayvan doluysa bireysel yemleme. */
export const consumptionInputSchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
  consumedOn: isoDateSchema,
  quantity: quantitySchema,
  groupId: uuidSchema.nullable().optional(),
  animalId: uuidSchema.nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type ConsumptionInput = z.infer<typeof consumptionInputSchema>;
export const consumptionPatchSchema = consumptionInputSchema.omit({ id: true, itemId: true }).partial();

/** Stok dışı gider. Alımlar ayrı tabloda, iki kez sayılmaz. */
export const expenseInputSchema = z.object({
  id: uuidSchema,
  category: expenseCategorySchema,
  spentAt: isoDateSchema,
  amount: moneySchema,
  description: z.string().trim().max(300).nullable().optional(),
  animalId: uuidSchema.nullable().optional(),
  documentPath: z.string().trim().max(300).nullable().optional(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export const expensePatchSchema = expenseInputSchema.omit({ id: true }).partial();

export const incomeInputSchema = z.object({
  id: uuidSchema,
  category: incomeCategorySchema,
  receivedAt: isoDateSchema,
  amount: moneySchema,
  description: z.string().trim().max(300).nullable().optional(),
  animalId: uuidSchema.nullable().optional(),
});
export type IncomeInput = z.infer<typeof incomeInputSchema>;
export const incomePatchSchema = incomeInputSchema.omit({ id: true }).partial();

/**
 * Alımda birim fiyat ile toplam birbirini tamamlar: biri girilince diğeri hesaplanır.
 * Sunucuda trigger, istemcide bu yardımcı aynı sonucu üretir (çevrimdışı için).
 */
export function resolvePurchaseAmounts(input: { quantity: number; unitPrice?: number | null; total?: number | null }): { unitPrice: number | null; total: number | null } {
  const { quantity } = input;
  const unitPrice = input.unitPrice ?? null;
  const total = input.total ?? null;
  if (total == null && unitPrice != null) return { unitPrice, total: round2(unitPrice * quantity) };
  if (unitPrice == null && total != null && quantity > 0) return { unitPrice: round2(total / quantity), total };
  return { unitPrice, total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stok bakiyesi: alımlar eksi tüketimler. Takip edilmeyen kalemlerde bakiye yok. */
export function stockBalance(input: { trackStock: boolean; purchased: number; consumed: number }): number | null {
  return input.trackStock ? round2(input.purchased - input.consumed) : null;
}

/**
 * Kalan gün: bakiye bölü günlük ortalama tüketim. Tüketim yoksa veya bakiye yoksa null.
 * Ortalama son `days` günün toplamından hesaplanır; hiç tüketim yoksa tahmin yapılmaz.
 */
export function daysOfStockLeft(balance: number | null, consumedInWindow: number, days: number): number | null {
  if (balance == null || balance <= 0 || consumedInWindow <= 0 || days <= 0) return null;
  // Tek bölme: önce günlük ortalamayı hesaplamak yuvarlama hatası veriyor, sunucu view'ı ile sapıyordu.
  return Math.floor((balance * days) / consumedInWindow);
}

/** Yeni çiftlikte açılan kalemler (bölüm 10: kovayla su, yağmur suyu, sayaç yok). */
export const seedStockItems: ReadonlyArray<{ name: string; category: StockCategory; unit: StockUnit; trackStock: boolean }> = [
  { name: "Yonca", category: "feed", unit: "kg", trackStock: true },
  { name: "Saman", category: "feed", unit: "bale", trackStock: true },
  { name: "Arpa", category: "feed", unit: "kg", trackStock: true },
  { name: "Su", category: "water", unit: "bucket", trackStock: false },
];

/** Stok seviyesi ve kalan gün hesabında kullanılan pencere. */
export const CONSUMPTION_WINDOW_DAYS = 14;
