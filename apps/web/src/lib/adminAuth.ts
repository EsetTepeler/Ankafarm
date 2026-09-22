import type { AppRouter } from "@anka/api";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import { create } from "zustand";

import { getApiUrl } from "./config";
import { storage } from "./storage";

type RouterOutputs = inferRouterOutputs<AppRouter>;
// Giriş artık iki şekilli dönüyor (token ya da ikinci adım); yönetici künyesi refresh yanıtından alınır.
export type AdminUser = RouterOutputs["platform"]["refresh"]["admin"];

/**
 * Süper admin oturumu, çiftlik oturumundan tamamen ayrı: ayrı token türü, ayrı refresh tablosu,
 * ayrı depolama anahtarları. Aynı tarayıcıda hem çiftlik sahibi hem yönetici açık kalabilir ve
 * biri diğerinin yetkisini almaz.
 */
const REFRESH_KEY = "anka.admin.refreshToken";
const ADMIN_KEY = "anka.admin.user";

interface AdminAuthState {
  status: "loading" | "signedOut" | "signedIn";
  accessToken: string | null;
  refreshToken: string | null;
  admin: AdminUser | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ needsTotp: boolean; challengeToken?: string }>;
  signInTotp: (challengeToken: string, code: string) => Promise<{ usedRecovery: boolean }>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<string | null>;
}

function plainClient() {
  return createTRPCClient<AppRouter>({ links: [httpLink({ url: `${getApiUrl()}/trpc`, transformer: superjson })] });
}

function readCachedAdmin(): AdminUser | null {
  try {
    const raw = storage.get(ADMIN_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  status: "loading",
  accessToken: null,
  refreshToken: null,
  admin: null,

  async restore() {
    const stored = storage.get(REFRESH_KEY);
    if (!stored) {
      set({ status: "signedOut" });
      return;
    }
    set({ refreshToken: stored, admin: readCachedAdmin() });
    const token = await get().refreshAccess();
    if (!token) set({ status: "signedOut" });
  },

  /** İki adımlı doğrulama açıksa token yerine aşama tokenı döner; oturum ikinci adımda açılır. */
  async signIn(email, password) {
    const result = await plainClient().platform.login.mutate({ email, password, device: "admin web" });
    if (result.status === "totp") return { needsTotp: true as const, challengeToken: result.challengeToken };
    storage.set(REFRESH_KEY, result.refreshToken);
    storage.set(ADMIN_KEY, JSON.stringify(result.admin));
    set({ status: "signedIn", accessToken: result.accessToken, refreshToken: result.refreshToken, admin: result.admin });
    return { needsTotp: false as const };
  },

  async signInTotp(challengeToken, code) {
    const result = await plainClient().platform.loginTotp.mutate({ challengeToken, code, device: "admin web" });
    storage.set(REFRESH_KEY, result.refreshToken);
    storage.set(ADMIN_KEY, JSON.stringify(result.admin));
    set({ status: "signedIn", accessToken: result.accessToken, refreshToken: result.refreshToken, admin: result.admin });
    return { usedRecovery: result.usedRecovery };
  },

  async signOut() {
    const { refreshToken } = get();
    set({ status: "signedOut", accessToken: null, refreshToken: null, admin: null });
    storage.remove(REFRESH_KEY);
    storage.remove(ADMIN_KEY);
    if (refreshToken) {
      try {
        await plainClient().platform.logout.mutate({ refreshToken });
      } catch {
        // sunucuya ulaşılamıyorsa yerel çıkış yeterli
      }
    }
  },

  async refreshAccess() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const { refreshToken } = get();
      if (!refreshToken) return null;
      try {
        const result = await plainClient().platform.refresh.mutate({ refreshToken });
        storage.set(REFRESH_KEY, result.refreshToken);
        storage.set(ADMIN_KEY, JSON.stringify(result.admin));
        set({ status: "signedIn", accessToken: result.accessToken, refreshToken: result.refreshToken, admin: result.admin });
        return result.accessToken;
      } catch (err) {
        if (err instanceof TRPCClientError) {
          storage.remove(REFRESH_KEY);
          storage.remove(ADMIN_KEY);
          set({ status: "signedOut", accessToken: null, refreshToken: null, admin: null });
        }
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  },
}));

/** Yönetici tokenıyla konuşan istemci. Çiftlik istemcisinden ayrı; token karışmasın diye her çağrıda kurulur. */
export function adminClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${getApiUrl()}/trpc`,
        transformer: superjson,
        async fetch(input, init) {
          const res = await fetch(input, init);
          if (res.status !== 401) return res;
          const token = await useAdminAuthStore.getState().refreshAccess();
          if (!token) return res;
          const headers = new Headers(init?.headers);
          headers.set("authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        },
        headers() {
          const token = useAdminAuthStore.getState().accessToken;
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
