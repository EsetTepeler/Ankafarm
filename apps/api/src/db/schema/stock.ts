import { boolean, date, index, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { animals, groups } from "./animals";
import { eventColumns, syncedColumns } from "./synced";

export const stockCategoryEnum = pgEnum("stock_category", ["feed", "water", "medicine", "supply", "other"]);
export const stockUnitEnum = pgEnum("stock_unit", ["kg", "bale", "liter", "bucket", "m3", "piece"]);
export const expenseCategoryEnum = pgEnum("expense_category", ["animal_purchase", "feed", "water", "electricity", "labor", "vet", "fuel", "equipment", "rent", "tax", "other"]);
export const incomeCategoryEnum = pgEnum("income_category", ["animal_sale", "milk", "wool", "manure", "subsidy", "other"]);

export const stockItems = pgTable(
  "stock_items",
  {
    ...syncedColumns,
    name: text().notNull(),
    category: stockCategoryEnum().notNull(),
    unit: stockUnitEnum().notNull(),
    minStock: numeric({ precision: 12, scale: 2, mode: "number" }),
    trackStock: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    notes: text(),
  },
  (t) => [uniqueIndex("stock_items_farm_name_uq").on(t.farmId, t.name), index("stock_items_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

/** Alım: stoğa giriş, aynı zamanda gider. total trigger ile quantity * unit_price'tan türer. */
export const purchases = pgTable(
  "purchases",
  {
    ...syncedColumns,
    ...eventColumns,
    itemId: uuid()
      .notNull()
      .references(() => stockItems.id),
    purchasedAt: date({ mode: "string" }).notNull(),
    quantity: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    unitPrice: numeric({ precision: 12, scale: 2, mode: "number" }),
    total: numeric({ precision: 12, scale: 2, mode: "number" }),
    supplier: text(),
    documentPath: text(),
    notes: text(),
  },
  (t) => [index("purchases_item_idx").on(t.itemId, t.purchasedAt), index("purchases_farm_date_idx").on(t.farmId, t.purchasedAt), index("purchases_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

/** Tüketim: stoktan çıkış. group_id boşsa tüm çiftlik, animal_id doluysa bireysel. */
export const consumptions = pgTable(
  "consumptions",
  {
    ...syncedColumns,
    ...eventColumns,
    itemId: uuid()
      .notNull()
      .references(() => stockItems.id),
    consumedOn: date({ mode: "string" }).notNull(),
    quantity: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    groupId: uuid().references(() => groups.id),
    animalId: uuid().references(() => animals.id),
    notes: text(),
  },
  (t) => [
    index("consumptions_item_idx").on(t.itemId, t.consumedOn),
    index("consumptions_farm_date_idx").on(t.farmId, t.consumedOn),
    index("consumptions_farm_sync_idx").on(t.farmId, t.syncSeq),
  ],
);

/** Stok dışı giderler; alımlar purchases tablosunda, iki kez sayılmaz. */
export const expenses = pgTable(
  "expenses",
  {
    ...syncedColumns,
    category: expenseCategoryEnum().notNull(),
    spentAt: date({ mode: "string" }).notNull(),
    amount: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    description: text(),
    animalId: uuid().references(() => animals.id),
    documentPath: text(),
  },
  (t) => [index("expenses_farm_date_idx").on(t.farmId, t.spentAt), index("expenses_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export const incomes = pgTable(
  "incomes",
  {
    ...syncedColumns,
    category: incomeCategoryEnum().notNull(),
    receivedAt: date({ mode: "string" }).notNull(),
    amount: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    description: text(),
    animalId: uuid().references(() => animals.id),
  },
  (t) => [index("incomes_farm_date_idx").on(t.farmId, t.receivedAt), index("incomes_farm_sync_idx").on(t.farmId, t.syncSeq)],
);

export type StockItem = typeof stockItems.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Consumption = typeof consumptions.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Income = typeof incomes.$inferSelect;
