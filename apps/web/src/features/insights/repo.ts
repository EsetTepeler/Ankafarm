import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/lib/trpc";

export type InsightSeverity = "critical" | "warning" | "info";

/** Sunucudaki içgörü listesi. Yerelde hesaplanmaz; Python servisi yazar, uygulama okur (bölüm 3.5). */
export function useInsights(options?: { animalId?: string; limit?: number }) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.insights.list.queryOptions({ animalId: options?.animalId, includeAcknowledged: false, limit: options?.limit ?? 50 }),
    // Bağlantı yoksa eldeki liste kalsın; içgörüler kritik değil, gecikmesi sorun değil.
    retry: false,
    staleTime: 60_000,
  });
}

export function useInsightActions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.insights.list.queryKey() });

  const acknowledge = useMutation({ ...trpc.insights.acknowledge.mutationOptions(), onSuccess: invalidate });
  const snooze = useMutation({ ...trpc.insights.snooze.mutationOptions(), onSuccess: invalidate });
  return { acknowledge, snooze, invalidate };
}

export const severityLabels: Record<InsightSeverity, string> = { critical: "Acil", warning: "Dikkat", info: "Bilgi" };

export const severityOrder: InsightSeverity[] = ["critical", "warning", "info"];
