import { useQuery } from "@tanstack/react-query";
import { Activity, Database, HardDrive, ShieldCheck, TriangleAlert } from "lucide-react";
import { Navigate } from "react-router";

import { PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/utils/date";

/** Yedek bu süreden eskiyse uyarı; günlük yedekte bir gün kaçmış demektir. */
const STALE_BACKUP_HOURS = 36;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  if (days) return `${days} gün ${hours} saat`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} saat ${minutes} dk` : `${minutes} dk`;
}

/** Sistem durumu (madde 4.5): yedek alınıyor mu, dosyalar duruyor mu, veritabanı ne kadar büyük? */
export function SystemPage() {
  const role = useAuthStore((s) => s.user?.role);
  const trpc = useTRPC();
  const status = useQuery({ ...trpc.system.status.queryOptions(), refetchInterval: 60_000, retry: false });

  if (role && role !== "owner") return <Navigate to="/" replace />;

  const d = status.data;
  const backups = [
    { key: "db", label: "Veritabanı yedeği", info: d?.backups.database, hint: "Her gece alınır" },
    { key: "uploads", label: "Fotoğraf yedeği", info: d?.backups.uploads, hint: "Fotoğraflar veritabanında değil, ayrı arşivlenir" },
  ];

  return (
    <>
      <PageHeader icon={ShieldCheck} title="Sistem durumu" description="Sunucu, yedekler ve depolama" />

      {status.isError ? <p className="mb-4 text-sm text-danger">Sunucuya ulaşılamadı; bu ekran bağlantı ister.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sunucu" value={d ? formatUptime(d.uptimeSeconds) : "–"} hint={d ? `Saat ${formatDateTime(d.serverTime)}` : undefined} testID="sys-uptime" />
        <StatTile label="Veritabanı" value={d ? formatBytes(d.database.bytes) : "–"} hint={d ? `${d.database.animals} hayvan kaydı` : undefined} testID="sys-db" />
        <StatTile label="Fotoğraf ve belge" value={d ? formatBytes(d.uploads.bytes) : "–"} hint={d ? `${d.uploads.files} dosya · ${d.uploads.records} künye` : undefined} testID="sys-uploads" />
        <StatTile label="Denetim kaydı" value={d?.database.auditRows ?? "–"} hint="Her değişiklik iz bırakır" testID="sys-audit" />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-muted-foreground" /> Yedekler
          </CardTitle>
          <CardDescription>Sunucu dışına haftalık kopya ayrıca kurulmalı; README'de tarif var.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {backups.map((b) => {
            const stale = !b.info || b.info.ageHours > STALE_BACKUP_HOURS;
            return (
              <div key={b.key} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm", d && stale && "border-danger/40 bg-danger/5")} data-testid={`backup-${b.key}`}>
                <span className="grid">
                  <span className="font-medium">{b.label}</span>
                  <span className="text-xs text-muted-foreground">{b.info ? `${b.info.name} · ${formatBytes(b.info.bytes)}` : b.hint}</span>
                </span>
                {!d ? (
                  <Badge variant="outline">–</Badge>
                ) : b.info ? (
                  <Badge variant={stale ? "destructive" : "outline"} className="gap-1">
                    {stale ? <TriangleAlert className="size-3.5" /> : <Activity className="size-3.5" />}
                    {formatRelative(b.info.at)}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <TriangleAlert className="size-3.5" /> Yedek bulunamadı
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4 text-muted-foreground" /> Ne nerede duruyor?
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>
            <Database className="mr-1 inline size-3.5" />
            Kayıtlar sunucudaki PostgreSQL'de ve her cihazın kendi kopyasında. Cihazdaki kopya sayesinde ahırda bağlantı olmadan da çalışır.
          </p>
          <p>
            <HardDrive className="mr-1 inline size-3.5" />
            Fotoğraf ve belgeler sunucudaki dosya biriminde; veritabanı yedeği bunları kapsamaz, ayrı arşivlenir.
          </p>
          <p>
            <ShieldCheck className="mr-1 inline size-3.5" />
            Ayarlar &gt; Dışa aktarma ekranından her şeyi CSV olarak indirebilirsin; bu sunucudan bağımsız üçüncü kopyadır.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
