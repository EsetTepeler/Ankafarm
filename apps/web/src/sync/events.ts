import type { QueryClient } from "@tanstack/react-query";

import type { LocalTableName } from "@/db/schema";

let queryClient: QueryClient | null = null;

export function bindQueryClient(qc: QueryClient) {
  queryClient = qc;
}

/** Senkron dışı tazelemeler için (örn. içgörü olayı). */
export function getQueryClient(): QueryClient | null {
  return queryClient;
}

/** Yerel veri sorgularının anahtarı: ["local", tablo, ...]. */
export function localKey(table: LocalTableName, ...rest: unknown[]) {
  return ["local", table, ...rest] as const;
}

/**
 * Türev sorguların bağımlılıkları: stok seviyesi alım ve tüketimden, aylık özet alımdan da hesaplanır.
 * Böylece hem yerel yazmada hem pull sonrasında doğru ekranlar tazelenir.
 */
const derivedFrom: Partial<Record<LocalTableName, LocalTableName[]>> = {
  purchases: ["stock_items", "expenses"],
  consumptions: ["stock_items"],
  stock_items: ["expenses"],
};

/** Yerel yazma veya pull sonrası ilgili sorguları tazeler. */
export function notifyLocalChange(tables: Iterable<LocalTableName>) {
  if (!queryClient) return;
  const all = new Set<LocalTableName>();
  for (const table of tables) {
    all.add(table);
    for (const dep of derivedFrom[table] ?? []) all.add(dep);
  }
  for (const table of all) {
    void queryClient.invalidateQueries({ queryKey: ["local", table] });
  }
  // Zaman çizelgesi birden çok tabloyu birleştirir; her değişiklikte tazelenir.
  void queryClient.invalidateQueries({ queryKey: ["local", "timeline"] });
}
