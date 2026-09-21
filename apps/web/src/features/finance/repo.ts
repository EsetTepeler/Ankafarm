import { expenseInputSchema, incomeInputSchema, type ExpenseCategory, type ExpenseInput, type IncomeCategory, type IncomeInput } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, desc, gte, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { expenses, incomes, purchases, stockItems } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertLocal, softDeleteLocal } from "@/sync/local";
import { todayIso } from "@/utils/date";

/** Ayın ilk ve son günü, YYYY-AA-GG. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

export function useExpenses(month?: string) {
  const range = month ? monthRange(month) : null;
  return useQuery({
    queryKey: localKey("expenses", month ?? "all"),
    queryFn: () =>
      getDb()
        .select()
        .from(expenses)
        .where(range ? and(isNull(expenses.deletedAt), gte(expenses.spentAt, range.from), lte(expenses.spentAt, range.to)) : isNull(expenses.deletedAt))
        .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
        .limit(200),
  });
}

export function useIncomes(month?: string) {
  const range = month ? monthRange(month) : null;
  return useQuery({
    queryKey: localKey("incomes", month ?? "all"),
    queryFn: () =>
      getDb()
        .select()
        .from(incomes)
        .where(range ? and(isNull(incomes.deletedAt), gte(incomes.receivedAt, range.from), lte(incomes.receivedAt, range.to)) : isNull(incomes.deletedAt))
        .orderBy(desc(incomes.receivedAt), desc(incomes.createdAt))
        .limit(200),
  });
}

export interface MonthlySummary {
  month: string;
  expense: number;
  income: number;
  /** Kategori bazında gider; alımlar kalem kategorisiyle girer, iki kez sayılmaz. */
  byCategory: { category: string; label: string; amount: number }[];
}

/** Aylık özet: stok alımları artı stok dışı giderler, karşısında gelirler. Sunucudaki v_monthly_costs ile aynı mantık. */
export function useMonthlySummary(month: string) {
  return useQuery({
    queryKey: localKey("expenses", "summary", month),
    queryFn: async (): Promise<MonthlySummary> => {
      const db = getDb();
      const { from, to } = monthRange(month);
      const [buys, exp, inc] = await Promise.all([
        db
          .select({ category: stockItems.category, name: stockItems.name, amount: sql<number>`sum(coalesce(${purchases.total}, 0))` })
          .from(purchases)
          .innerJoin(stockItems, sql`${stockItems.id} = ${purchases.itemId}`)
          .where(and(isNull(purchases.deletedAt), gte(purchases.purchasedAt, from), lte(purchases.purchasedAt, to)))
          .groupBy(stockItems.category, stockItems.name),
        db
          .select({ category: expenses.category, amount: sql<number>`sum(${expenses.amount})` })
          .from(expenses)
          .where(and(isNull(expenses.deletedAt), gte(expenses.spentAt, from), lte(expenses.spentAt, to)))
          .groupBy(expenses.category),
        db
          .select({ amount: sql<number>`sum(${incomes.amount})` })
          .from(incomes)
          .where(and(isNull(incomes.deletedAt), gte(incomes.receivedAt, from), lte(incomes.receivedAt, to))),
      ]);

      const rows = new Map<string, { category: string; label: string; amount: number }>();
      const add = (category: string, label: string, amount: number) => {
        const key = `${category}:${label}`;
        const prev = rows.get(key);
        if (prev) prev.amount += amount;
        else rows.set(key, { category, label, amount });
      };
      for (const b of buys) add(b.category, b.name, b.amount ?? 0);
      for (const e of exp) add(e.category, "", e.amount ?? 0);

      const list = [...rows.values()].filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
      return {
        month,
        expense: list.reduce((s, r) => s + r.amount, 0),
        income: inc[0]?.amount ?? 0,
        byCategory: list,
      };
    },
  });
}

export async function addExpense(input: Omit<ExpenseInput, "id">) {
  const parsed = expenseInputSchema.parse({ id: newId(), ...input });
  return insertLocal("expenses", {
    category: parsed.category,
    spentAt: parsed.spentAt,
    amount: parsed.amount,
    description: parsed.description ?? null,
    animalId: parsed.animalId ?? null,
    documentPath: null,
  });
}

export async function addIncome(input: Omit<IncomeInput, "id">) {
  const parsed = incomeInputSchema.parse({ id: newId(), ...input });
  return insertLocal("incomes", {
    category: parsed.category,
    receivedAt: parsed.receivedAt,
    amount: parsed.amount,
    description: parsed.description ?? null,
    animalId: parsed.animalId ?? null,
  });
}

export async function deleteExpense(id: string) {
  return softDeleteLocal("expenses", id);
}

export async function deleteIncome(id: string) {
  return softDeleteLocal("incomes", id);
}

export type { ExpenseCategory, IncomeCategory };
