import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Boxes, CalendarCheck, ChevronRight, Download, History, RefreshCw, Server, Settings, ShieldCheck, SlidersHorizontal, User, Users } from "lucide-react";
import { Link } from "react-router";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth";
import { appVersion, getApiUrl } from "@/lib/config";
import { useTRPC } from "@/lib/trpc";
import { useSyncStore } from "@/sync/store";
import { formatDateTime } from "@/utils/date";
import { isStoragePersistent } from "@/db";

const roleLabels = { owner: "Sahip", worker: "Bakıcı", vet: "Veteriner" } as const;

export function SettingsPage() {
  const trpc = useTRPC();
  const user = useAuthStore((s) => s.user);
  const sync = useSyncStore();
  const farm = useQuery(trpc.farm.get.queryOptions());
  const users = useQuery({ ...trpc.users.list.queryOptions(), enabled: user?.role === "owner" });

  return (
    <>
      <PageHeader icon={Settings} title="Ayarlar" description={farm.data?.name ?? "Çiftlik"} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="size-4 text-primary" /> Çiftlik
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <LinkRow icon={Boxes} to="/settings/groups" title="Gruplar ve bölmeler" sub="Ana sürü, karantina, mera" testID="settings-groups" />
            <LinkRow
              icon={RefreshCw}
              to="/settings/sync"
              title="Senkron durumu"
              sub={`${sync.pending} bekliyor · ${sync.failed} reddedildi${sync.lastSyncAt ? ` · son ${formatDateTime(sync.lastSyncAt)}` : ""}`}
              testID="settings-sync"
            />
            {user?.role === "owner" ? <LinkRow icon={History} to="/audit" title="Değişiklik geçmişi" sub="Kim, ne zaman, neyi değiştirdi" testID="settings-audit" /> : null}
            <LinkRow icon={CalendarCheck} to="/settings/protocols" title="Aşı ve bakım programı" sub="Yıllık takvim; hatırlatıcılar buradan türetilir" testID="settings-protocols" />
            {user?.role === "owner" ? <LinkRow icon={SlidersHorizontal} to="/settings/thresholds" title="İçgörü eşikleri" sub="Uyarılar ne zaman çıksın" testID="settings-thresholds" /> : null}
            {user?.role === "owner" ? <LinkRow icon={ShieldCheck} to="/settings/system" title="Sistem durumu" sub="Yedekler, depolama, sunucu" testID="settings-system" /> : null}
            <LinkRow icon={Download} to="/settings/export" title="Dışa aktarma" sub="Kayıtları Excel için CSV olarak indir" testID="settings-export" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4 text-primary" /> Hesap
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
              <span className="text-muted-foreground">Ad</span>
              <span>{user?.fullName}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
              <span className="text-muted-foreground">E-posta</span>
              <span>{user?.email}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
              <span className="text-muted-foreground">Rol</span>
              <span>{user ? roleLabels[user.role] : ""}</span>
            </div>
          </CardContent>
        </Card>

        {user?.role === "owner" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-primary" /> Kullanıcılar
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {(users.data ?? []).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="grid">
                    <span>{u.fullName}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{roleLabels[u.role]}</Badge>
                    {!u.active ? <Badge variant="destructive">devre dışı</Badge> : null}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Kullanıcı ekleme arayüzü sonra; şimdilik API üzerinden.</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="size-4 text-primary" /> Sistem
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
              <span className="text-muted-foreground">API</span>
              <span className="font-mono text-xs">{getApiUrl()}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
              <span className="text-muted-foreground">Yerel depolama</span>
              <span>{isStoragePersistent() ? "Kalıcı (OPFS)" : "Geçici, bellek içi"}</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
              <span className="text-muted-foreground">Sürüm</span>
              <span>{appVersion}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function LinkRow({ to, title, sub, testID, icon: Icon }: { to: string; title: string; sub?: string; testID?: string; icon?: LucideIcon }) {
  return (
    <Link to={to} data-testid={testID} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-accent/50">
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="grid min-w-0 flex-1">
        <span className="font-medium">{title}</span>
        {sub ? <span className="truncate text-xs text-muted-foreground">{sub}</span> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
