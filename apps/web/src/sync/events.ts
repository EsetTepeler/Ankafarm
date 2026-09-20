import type { QueryClient } from "@tanstack/react-query";

import type { LocalTableName } from "@/db/schema";

let queryClient: QueryClient | null = null;

export function bindQueryClient(qc: QueryClient) {
  queryClient = qc;
}

/** Yerel veri sorgularının anahtarı: ["local", tablo, ...]. */
export function localKey(table: LocalTableName, ...rest: unknown[]) {
  return ["local", table, ...rest] as const;
}

/** Yerel yazma veya pull sonrası ilgili sorguları tazeler. */
export function notifyLocalChange(tables: Iterable<LocalTableName>) {
  if (!queryClient) return;
  for (const table of new Set(tables)) {
    void queryClient.invalidateQueries({ queryKey: ["local", table] });
  }
  // Zaman çizelgesi birden çok tabloyu birleştirir; her değişiklikte tazelenir.
  void queryClient.invalidateQueries({ queryKey: ["local", "timeline"] });
}
