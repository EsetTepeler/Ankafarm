import { useNetworkState } from "expo-network";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useSyncStore } from "./store";
import { refreshCounts, syncNow } from "./worker";

const PERIODIC_MS = 60_000;

/** Senkron tetikleyicileri: açılış, uygulama öne gelince, bağlantı gelince, dakikada bir. */
export function useSyncTriggers() {
  const network = useNetworkState();
  const wasOnline = useRef<boolean | null>(null);

  useEffect(() => {
    void refreshCounts();
    void syncNow("start");
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow("foreground");
    });
    const timer = setInterval(() => void syncNow("periodic"), PERIODIC_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const online = network.isConnected !== false && network.isInternetReachable !== false;
    useSyncStore.getState().set({ online });
    if (online && wasOnline.current === false) void syncNow("online");
    wasOnline.current = online;
  }, [network.isConnected, network.isInternetReachable]);
}
