import { useEffect } from "react";

import { connectRealtime, disconnectRealtime } from "./realtime";
import { useSyncStore } from "./store";
import { refreshCounts, syncNow } from "./worker";

const PERIODIC_MS = 60_000;

/** Senkron tetikleyicileri: açılış, sekme öne gelince, bağlantı gelince, dakikada bir. */
export function useSyncTriggers() {
  useEffect(() => {
    useSyncStore.getState().set({ online: navigator.onLine });
    void refreshCounts();
    void syncNow("start");
    connectRealtime();

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow("foreground");
    };
    const onOnline = () => {
      useSyncStore.getState().set({ online: true });
      void syncNow("online");
    };
    const onOffline = () => useSyncStore.getState().set({ online: false });

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => void syncNow("periodic"), PERIODIC_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
      disconnectRealtime();
    };
  }, []);
}
