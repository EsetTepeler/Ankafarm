import type { AppRouter } from "@anka/api";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
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
const USER_KEY = "anka.user";

/** Auth çağrıları için yetkisiz, bağımsız istemci (döngüsel bağımlılığı önler). */
function plainClient() {
  return createTRPCClient<AppRouter>({
    links: [httpLink({ url: `${getApiUrl()}/trpc`, transformer: superjson })],
  });
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : "web";
  return `web ${os}`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof TRPCClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Beklenmeyen bir hata oluştu";
}

function readCachedUser(): AuthUser | null {
  try {
    const raw = storage.get(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  accessToken: null,
  refreshToken: null,
  user: null,

  async restore() {
    await resolveApiUrl();
    const stored = storage.get(REFRESH_KEY);
    if (!stored) {
      set({ status: "signedOut" });
      return;
    }
    // Çevrimdışı açılışta kullanıcı bilgisi önbellekten gelir; sunucuya ulaşılınca tazelenir.
    set({ refreshToken: stored, user: readCachedUser() });
    const token = await get().refreshAccess();
    if (!token && get().status === "loading") set({ status: "signedOut" });
  },

  async signIn(email, password) {
    const result = await plainClient().auth.login.mutate({ email, password, device: deviceLabel() });
    storage.set(REFRESH_KEY, result.refreshToken);
    storage.set(USER_KEY, JSON.stringify(result.user));
    set({ status: "signedIn", accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
  },

  async signOut() {
    const { refreshToken } = get();
    set({ status: "signedOut", accessToken: null, refreshToken: null, user: null });
    storage.remove(REFRESH_KEY);
    storage.remove(USER_KEY);
    if (refreshToken) {
      try {
        await plainClient().auth.logout.mutate({ refreshToken });
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
        const result = await plainClient().auth.refresh.mutate({ refreshToken });
        storage.set(REFRESH_KEY, result.refreshToken);
        storage.set(USER_KEY, JSON.stringify(result.user));
        set({ status: "signedIn", accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
        return result.accessToken;
      } catch (err) {
        // Sunucu reddettiyse (süresi dolmuş, iptal) oturumu kapat; ağ hatasında oturumu koru.
        const unauthorized = err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED";
        if (unauthorized) {
          storage.remove(REFRESH_KEY);
          storage.remove(USER_KEY);
          set({ status: "signedOut", accessToken: null, refreshToken: null, user: null });
        } else if (get().status === "loading" && get().user) {
          // Çevrimdışı açılış: önbellekteki kullanıcıyla içeri al; ilk başarılı istekte yenilenir.
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
