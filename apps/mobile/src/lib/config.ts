import Constants from "expo-constants";
import { Platform } from "react-native";

let resolvedApiUrl: string | null = null;

/**
 * API adresi çözümleme sırası:
 * - Web: sunucunun servis ettiği /config.json (nginx açılışta üretir), yoksa EXPO_PUBLIC_API_URL,
 *   yoksa aynı host üzerinde 3000 portu.
 * - Native: EXPO_PUBLIC_API_URL, yoksa geliştirmede Metro'nun host adresi (telefon aynı ağda) ile 3000 portu.
 */
export async function resolveApiUrl(): Promise<string> {
  if (resolvedApiUrl) return resolvedApiUrl;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (Platform.OS === "web") {
    try {
      const res = await fetch("/config.json", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { apiUrl?: unknown };
        if (typeof json.apiUrl === "string" && json.apiUrl) {
          resolvedApiUrl = json.apiUrl.replace(/\/+$/, "");
          return resolvedApiUrl;
        }
      }
    } catch {
      // config.json yoksa aşağıdaki yedeklere düş
    }
    resolvedApiUrl = fromEnv ?? `${window.location.protocol}//${window.location.hostname}:3000`;
    return resolvedApiUrl;
  }

  if (fromEnv) {
    resolvedApiUrl = fromEnv;
    return resolvedApiUrl;
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  resolvedApiUrl = host ? `http://${host}:3000` : "http://localhost:3000";
  return resolvedApiUrl;
}

export function getApiUrl(): string {
  if (!resolvedApiUrl) throw new Error("API adresi henüz çözümlenmedi; önce resolveApiUrl çağrılmalı");
  return resolvedApiUrl;
}

export const appVersion = Constants.expoConfig?.version ?? "0.0.0";
