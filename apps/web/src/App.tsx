import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";

import { AppShell } from "@/components/layout/AppShell";
import { Boot } from "@/components/layout/Boot";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { openLocalDb } from "@/db";
import { useAuthStore } from "@/lib/auth";
import { createQueryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/lib/theme";
import { getApiClient, TRPCProvider, type ApiClient } from "@/lib/trpc";
import { AnimalFormPage } from "@/pages/animals/AnimalFormPage";
import { AnimalPage } from "@/pages/animals/AnimalPage";
import { AnimalsPage } from "@/pages/animals/AnimalsPage";
import { BulkPage } from "@/pages/animals/BulkPage";
import { LoginPage } from "@/pages/LoginPage";
import { GroupsPage } from "@/pages/settings/GroupsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SyncPage } from "@/pages/settings/SyncPage";
import { DailyRoundPage } from "@/pages/animals/DailyRoundPage";
import { FinancePage } from "@/pages/finance/FinancePage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { AuditPage } from "@/pages/settings/AuditPage";
import { ExportPage } from "@/pages/settings/ExportPage";
import { BreedingPage } from "@/pages/breeding/BreedingPage";
import { ScanPage } from "@/pages/ScanPage";
import { StockPage } from "@/pages/stock/StockPage";
import { TodayPage } from "@/pages/TodayPage";
import { bindQueryClient } from "@/sync/events";

// Tek QueryClient: StrictMode başlatıcıyı iki kez çağırdığı için useState içinde kurulmaz.
const queryClient = createQueryClient();
bindQueryClient(queryClient);

type BootState = { phase: "db" } | { phase: "auth" } | { phase: "ready"; api: ApiClient } | { phase: "failed"; message: string };

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  // QR ile gelen /a/<id> gibi adresler giriş sonrası açılsın diye hedef saklanır.
  if (status !== "signedIn") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export function App() {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const [boot, setBoot] = useState<BootState>({ phase: "db" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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

  return (
    <ThemeProvider>
      <TooltipProvider>
      {boot.phase === "failed" ? (
        <Boot title="Yerel veritabanı açılamadı" detail={boot.message} />
      ) : boot.phase !== "ready" || status === "loading" ? (
        <Boot title={boot.phase === "db" ? "Yerel veritabanı hazırlanıyor" : "Oturum kontrol ediliyor"} />
      ) : (
        <QueryClientProvider client={queryClient}>
          <TRPCProvider trpcClient={boot.api} queryClient={queryClient}>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={status === "signedIn" ? <Navigate to="/" replace /> : <LoginPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<TodayPage />} />
                  <Route path="animals" element={<AnimalsPage />} />
                  <Route path="animals/new" element={<AnimalFormPage />} />
                  <Route path="animals/bulk" element={<BulkPage />} />
                  <Route path="animals/round" element={<DailyRoundPage />} />
                  <Route path="animals/:id" element={<AnimalPage />} />
                  <Route path="animals/:id/edit" element={<AnimalFormPage />} />
                  <Route path="a/:id" element={<AnimalPage />} />
                  <Route path="scan" element={<ScanPage />} />
                  <Route path="stock" element={<StockPage />} />
                  <Route path="finance" element={<FinancePage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="breeding" element={<BreedingPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="settings/groups" element={<GroupsPage />} />
                  <Route path="settings/sync" element={<SyncPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="settings/export" element={<ExportPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </TRPCProvider>
        </QueryClientProvider>
      )}
      <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}
