import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
        // Yerel SQLite sorguları ağdan bağımsız; varsayılan "online" modu çevrimdışıyken sorguyu askıya alır.
        networkMode: "always",
      },
      mutations: {
        networkMode: "always",
      },
    },
  });
}
