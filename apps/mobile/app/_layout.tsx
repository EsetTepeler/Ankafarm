import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { PaperProvider, Text } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Splash } from "@/components/Splash";
import { openLocalDb } from "@/db";
import { useAuthStore } from "@/lib/auth";
import { createQueryClient } from "@/lib/queryClient";
import { darkTheme, lightTheme } from "@/lib/theme";
import { getApiClient, TRPCProvider, type ApiClient } from "@/lib/trpc";
import { bindQueryClient } from "@/sync/events";

type Boot = { phase: "db" } | { phase: "auth" } | { phase: "ready"; api: ApiClient } | { phase: "failed"; message: string };

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? darkTheme : lightTheme;
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const [queryClient] = useState(() => {
    const qc = createQueryClient();
    bindQueryClient(qc);
    return qc;
  });
  const [boot, setBoot] = useState<Boot>({ phase: "db" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Yerel veritabanı (migration dahil). 2. API adresi ve oturum. 3. tRPC istemcisi.
        await openLocalDb();
        if (cancelled) return;
        setBoot({ phase: "auth" });
        await restore().catch(() => useAuthStore.setState({ status: "signedOut" }));
        if (cancelled) return;
        setBoot({ phase: "ready", api: getApiClient() });
      } catch (err) {
        if (!cancelled) setBoot({ phase: "failed", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restore]);

  let body: ReactNode;
  if (boot.phase === "failed") {
    body = (
      <Splash message="Yerel veritabanı açılamadı">
        <Text variant="bodySmall">{boot.message}</Text>
      </Splash>
    );
  } else if (boot.phase !== "ready" || status === "loading") {
    body = <Splash message={boot.phase === "db" ? "Yerel veritabanı hazırlanıyor" : "Oturum kontrol ediliyor"} />;
  } else {
    body = (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={boot.api} queryClient={queryClient}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }} />
        </TRPCProvider>
      </QueryClientProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        {body}
      </PaperProvider>
    </SafeAreaProvider>
  );
}
