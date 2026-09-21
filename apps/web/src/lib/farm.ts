import { useQuery } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { useEffect } from "react";

import { getDb } from "@/db";
import { meta } from "@/db/schema";
import { useTRPC } from "@/lib/trpc";

const FALLBACK = "Anka Farm";

/**
 * Çiftlik adı. Sunucudan gelir ama yerel `meta` tablosunda saklanır; etiket basımı gibi
 * çevrimdışı da çalışması gereken yerler buradan okur.
 */
export function useFarmName(): string {
  const trpc = useTRPC();
  const cached = useQuery({
    queryKey: ["local", "meta", "farmName"],
    queryFn: async () => {
      const [row] = await getDb().select().from(meta).where(eq(meta.key, "farmName")).limit(1);
      return row?.value ?? null;
    },
  });
  const remote = useQuery({ ...trpc.farm.get.queryOptions(), staleTime: 5 * 60_000, retry: false });

  const name = remote.data?.name ?? null;
  useEffect(() => {
    if (!name || name === cached.data) return;
    void getDb().insert(meta).values({ key: "farmName", value: name }).onConflictDoUpdate({ target: meta.key, set: { value: name } });
  }, [name, cached.data]);

  return name ?? cached.data ?? FALLBACK;
}
