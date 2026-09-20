let resolvedApiUrl: string | null = null;

/**
 * API adresi: sunucunun servis ettiği /config.json (nginx açılışta üretir), yoksa VITE_API_URL,
 * yoksa aynı host üzerinde 3000 portu. Aynı imaj staging ve prod'da çalışsın diye derleme anında sabitlenmez.
 */
export async function resolveApiUrl(): Promise<string> {
  if (resolvedApiUrl) return resolvedApiUrl;
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
    // config.json yoksa yedeklere düş
  }
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  const url = fromEnv || `${window.location.protocol}//${window.location.hostname}:3000`;
  resolvedApiUrl = url;
  return url;
}

export function getApiUrl(): string {
  if (!resolvedApiUrl) throw new Error("API adresi henüz çözümlenmedi; önce resolveApiUrl çağrılmalı");
  return resolvedApiUrl;
}

export const appVersion: string = import.meta.env.VITE_APP_VERSION ?? "0.1.0";
