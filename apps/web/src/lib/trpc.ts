import type { AppRouter } from "@anka/api";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import { useAuthStore } from "./auth";
import { getApiUrl } from "./config";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

/** 401 gelirse bir kez refresh dener ve isteği yeni token ile tekrarlar. */
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const token = await useAuthStore.getState().refreshAccess();
  if (!token) return res;
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

let client: ApiClient | null = null;

/** Tek istemci: React sağlayıcısı ve senkron işçisi aynısını kullanır. API adresi çözüldükten sonra çağrılır. */
export function getApiClient(): ApiClient {
  if (client) return client;
  client = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getApiUrl()}/trpc`,
        transformer: superjson,
        fetch: authFetch,
        headers() {
          const token = useAuthStore.getState().accessToken;
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
  return client;
}
