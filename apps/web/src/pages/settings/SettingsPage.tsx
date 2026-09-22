import { labels } from "@anka/shared";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Boxes, CalendarCheck, ChevronRight, Copy, Download, History, RefreshCw, Server, Settings, ShieldCheck, SlidersHorizontal, User, Users } from "lucide-react";
import { Link } from "react-router";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth";
import { appVersion, getApiUrl } from "@/lib/config";
import { useTRPC } from "@/lib/trpc";
import { useSyncStore } from "@/sync/store";
import { formatDateTime } from "@/utils/date";
import { isStoragePersistent } from "@/db";

export function SettingsPage() {
  const trpc = useTRPC();
  const user = useAuthStore((s) => s.user);
  const sync = useSyncStore();
  const farm = useQuery(trpc.farm.get.queryOptions());
  const users = useQuery({ ...trpc.users.list.queryOptions(), enabled: user?.role === "owner" });

  return (
    <>
      <PageHeader
        eyebrow="Çiftlik"
        title="Ayarlar"
        description={farm.data?.name ?? "Çiftlik"}
        actions={
          farm.data?.code ? (
            <button
              type="button"
              className="label-micro flex items-center gap-1.5 border px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-primary"
              title="Çiftlik kodunu kopyala"
              data-testid="farm-code"
              onClick={() => void navigator.clipboard.writeText(farm.data.code).then(() => toast.success("Çiftlik kodu kopyalandı"))}
            >
              {farm.data.code} <Copy className="size-3" />
            </button>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
            Çiftlik
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <LinkRow to="/settings/groups" title="Gruplar ve bölmeler" sub="Ana sürü, karantina, mera" testID="settings-groups" />
            <LinkRow to="/settings/protocols" title="Aşı ve bakım planlaması" sub="Yıllık takvim; hatırlatıcılar buradan türetilir" testID="settings-protocols" />
            <LinkRow to="/transfers" title="Devirler" sub="Hayvanın başka çiftliğe geçişi; çiftlik kodu yukarıda" testID="settings-transfers" />
            {user?.role === "owner" ? <LinkRow to="/settings/thresholds" title="İçgörü eşikleri" sub="Uyarılar ne zaman çıksın" testID="settings-thresholds" /> : null}
            {user?.role === "owner" ? <LinkRow to="/audit" title="Değişiklik geçmişi" sub="Kim, ne zaman, neyi değiştirdi" testID="settings-audit" /> : null}
            <LinkRow to="/settings/export" title="Dışa aktarma" sub="Kayıtları Excel için CSV olarak indir" testID="settings-export" />
            {user?.role === "owner" ? <LinkRow to="/settings/system" title="Sistem durumu" sub="Yedekler, depolama, sunucu" testID="settings-system" /> : null}
            {/* Senkron en altta: günlük işte açılmıyor, sorun çıkınca bakılıyor (çiftlik sahibi isteği). */}
            <LinkRow
              to="/settings/sync"
              title="Senkron durumu"
              sub={`${sync.pending} bekliyor · ${sync.failed} reddedildi${sync.lastSyncAt ? ` · son ${formatDateTime(sync.lastSyncAt)}` : ""}`}
              testID="settings-sync"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
            Hesap
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
              <span>{user ? labels.userRole[user.role] : ""}</span>
            </div>
          </CardContent>
        </Card>

        {user?.role === "owner" ? (
          <Card>
            <CardHeader>
              <CardTitle>Kullanıcılar</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {(users.data ?? []).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 border-b px-1 py-2 last:border-0">
                  <div className="grid min-w-0">
                    <span className="truncate">{u.fullName}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{u.email}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline">{labels.userRole[u.role]}</Badge>
                    {u.active ? null : <Badge variant="destructive">kapalı</Badge>}
                  </div>
                </div>
              ))}
              <Button asChild variant="outline" size="sm" className="mt-2 justify-self-start">
                <Link to="/settings/users" data-testid="settings-users">
                  <Users /> Kullanıcıları yönet
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>
            Sistem
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

function LinkRow({ to, title, sub, testID }: { to: string; title: string; sub?: string; testID?: string }) {
  return (
    <Link to={to} data-testid={testID} className="group flex items-center gap-3 border-b px-1 py-3 text-sm transition-colors last:border-0 hover:bg-accent/50">
      <div className="grid min-w-0 flex-1">
        <span className="font-medium">{title}</span>
        {sub ? <span className="truncate text-xs text-muted-foreground">{sub}</span> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
