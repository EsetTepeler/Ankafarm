import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "error";

interface SyncState {
  status: SyncStatus;
  /** Cihazın ağ bağlantısı var mı (expo-network). */
  online: boolean;
  /** Son senkron denemesinde sunucuya ulaşıldı mı. Ağ var ama sunucu kapalı olabilir. */
  serverReachable: boolean;
  pending: number;
  failed: number;
  lastSyncAt: string | null;
  lastError: string | null;
  set: (patch: Partial<Omit<SyncState, "set">>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  online: true,
  serverReachable: true,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
  set: (patch) => set(patch),
}));

/** Kullanıcıya gösterilecek özet durum. */
export function describeSync(s: Pick<SyncState, "status" | "online" | "serverReachable" | "pending" | "failed">): {
  tone: "ok" | "info" | "warn" | "error";
  text: string | null;
} {
  const waiting = s.pending > 0 ? ` · ${s.pending} kayıt bekliyor` : "";
  if (s.failed > 0) return { tone: "error", text: `${s.failed} kayıt sunucu tarafından reddedildi` };
  if (!s.online) return { tone: "warn", text: `Çevrimdışı${waiting || " · kayıtlar cihazda saklanıyor"}` };
  if (s.status === "syncing") return { tone: "info", text: `Senkron ediliyor${waiting}` };
  if (s.status === "error" && !s.serverReachable) return { tone: "warn", text: `Sunucuya ulaşılamıyor${waiting}` };
  if (s.status === "error") return { tone: "error", text: `Senkron hatası${waiting}` };
  if (s.pending > 0) return { tone: "info", text: `${s.pending} kayıt senkron bekliyor` };
  return { tone: "ok", text: null };
}
