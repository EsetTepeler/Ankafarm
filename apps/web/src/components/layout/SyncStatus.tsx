import { CloudOff, RefreshCw, TriangleAlert, Check } from "lucide-react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";
import { describeSync, useSyncStore } from "@/sync/store";

/** Üst çubuktaki senkron durumu; dokununca Ayarlar > Senkron. */
export function SyncStatus() {
  const state = useSyncStore();
  const { tone, text } = describeSync(state);
  const label = text ?? "Güncel";
  const Icon = state.status === "syncing" ? RefreshCw : tone === "error" ? TriangleAlert : tone === "warn" ? CloudOff : Check;
  return (
    <Link
      to="/settings/sync"
      data-testid="sync-banner"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "ok" && "border-transparent bg-muted text-muted-foreground",
        tone === "info" && "border-transparent bg-accent text-accent-foreground",
        tone === "warn" && "border-warning/40 bg-warning/15 text-foreground",
        tone === "error" && "border-danger/40 bg-danger/10 text-danger",
      )}
    >
      <Icon className={cn("size-3.5", state.status === "syncing" && "animate-spin")} />
      <span>{label}</span>
    </Link>
  );
}
