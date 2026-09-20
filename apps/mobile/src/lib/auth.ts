import type { AppRouter } from "@anka/api";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { Platform } from "react-native";
import superjson from "superjson";
import { create } from "zustand";

import { getApiUrl, resolveApiUrl } from "./config";
import { storage } from "./storage";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type AuthUser = RouterOutputs["auth"]["login"]["user"];

export type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Açılışta: API adresini çöz, kayıtlı refresh token varsa oturumu geri getir. */
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Yeni access token döner, başarısızsa oturumu kapatır ve null döner. Eşzamanlı çağrılar tek istekte birleşir. */
  refreshAccess: () => Promise<string | null>;
}

const REFRESH_KEY = "anka.refreshToken";

/** Auth çağrıları için yetkisiz, bağımsız istemci (döngüsel bağımlılığı önler). */
function plainClient() {
  return createTRPCClient<AppRouter>({
    links: [httpLink({ url: `${getApiUrl()}/trpc`, transformer: superjson })],
  });
}

function deviceLabel(): string {
  return Platform.OS === "web" ? "web" : `${Platform.OS} ${Platform.Version}`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof TRPCClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Beklenmeyen bir hata oluştu";
}

let refreshInFlight: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  accessToken: null,
  refreshToken: null,
  user: null,

  async restore() {
    await resolveApiUrl();
    const stored = await storage.get(REFRESH_KEY);
    if (!stored) {
      set({ status: "signedOut" });
      return;
    }
    set({ refreshToken: stored });
    const token = await get().refreshAccess();
    if (!token) set({ status: "signedOut" });
  },

  async signIn(email, password) {
    const result = await plainClient().auth.login.mutate({ email, password, device: deviceLabel() });
    await storage.set(REFRESH_KEY, result.refreshToken);
    set({
      status: "signedIn",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  },

  async signOut() {
    const { refreshToken } = get();
    set({ status: "signedOut", accessToken: null, refreshToken: null, user: null });
    await storage.remove(REFRESH_KEY);
    if (refreshToken) {
      try {
        await plainClient().auth.logout.mutate({ refreshToken });
      } catch {
        // sunucuya ulaşılamıyorsa yerel çıkış yeterli; token süresi dolunca zaten geçersiz
      }
    }
  },

  async refreshAccess() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const { refreshToken } = get();
      if (!refreshToken) return null;
      try {
        const result = await plainClient().auth.refresh.mutate({ refreshToken });
        await storage.set(REFRESH_KEY, result.refreshToken);
        set({
          status: "signedIn",
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        });
        return result.accessToken;
      } catch (err) {
        // Sunucu reddettiyse (süresi dolmuş, iptal) oturumu kapat; ağ hatasında oturumu koru.
        const unauthorized = err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED";
        if (unauthorized) {
          await storage.remove(REFRESH_KEY);
          set({ status: "signedOut", accessToken: null, refreshToken: null, user: null });
        } else if (get().status === "loading") {
          // Çevrimdışı açılış: token'ı tut, kullanıcıyı içeri al; ilk başarılı istekte yenilenir.
          set({ status: "signedIn" });
        }
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  },
}));
