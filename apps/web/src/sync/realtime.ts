import { io, type Socket } from "socket.io-client";

import { useAuthStore } from "@/lib/auth";
import { getApiUrl } from "@/lib/config";

import { scheduleSync } from "./worker";

let socket: Socket | null = null;

/**
 * Sunucudan "changed" olayı gelince pull tetiklenir; olaylar 500 ms biriktirilir (bölüm 3.2).
 * Bağlantı yokken sessiz; socket.io kendi yeniden bağlanır. Token yenilenince yeniden bağlanır.
 */
export function connectRealtime() {
  if (socket) return;
  const auth = () => ({ token: useAuthStore.getState().accessToken ?? "" });
  socket = io(getApiUrl(), { path: "/socket.io", auth, transports: ["websocket", "polling"], reconnectionDelayMax: 30_000 });
  socket.on("changed", () => scheduleSync("remote", 500));
  socket.on("connect_error", (err) => {
    if (err.message === "UNAUTHORIZED") {
      // Access token süresi dolmuş olabilir; yenileyip bir daha dene.
      void useAuthStore.getState().refreshAccess().then((t) => {
        if (t && socket) socket.connect();
      });
    }
  });
  // Token değişince (refresh) socket.io auth callback'i yeni token'ı okur; bağlantı koparsa yeniden kurar.
  useAuthStore.subscribe((s, prev) => {
    if (s.status !== "signedIn") socket?.disconnect();
    else if (prev.status !== "signedIn" && socket && !socket.connected) socket.connect();
  });
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

export function isRealtimeConnected(): boolean {
  return !!socket?.connected;
}
