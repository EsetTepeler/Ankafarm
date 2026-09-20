import { labels, type AnimalEvent } from "@anka/shared";
import { ArrowLeftRight, Baby, Check, CloudOff, Eye, HeartHandshake, LogOut, RefreshCw, Scale, Star, Syringe, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard, useRecentEvents, type FeedItem } from "@/features/dashboard/repo";
import { useRecentAbnormalObservations } from "@/features/observations/repo";
import { useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { describeSync, useSyncStore } from "@/sync/store";
import { scheduleSync } from "@/sync/worker";
import { formatDate, formatRelative, isoToDisplay, todayIso } from "@/utils/date";

const eventIcon: Record<AnimalEvent["type"], typeof Star> = {
  created: Star,
  weight: Scale,
  group_move: ArrowLeftRight,
  health: Syringe,
  breeding: HeartHandshake,
  lambing: Baby,
  exit: LogOut,
  observation: Eye,
};

function daysUntil(iso: string): number {
  const a = new Date(`${todayIso()}T00:00:00Z`).getTime();
  const b = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Toplu sağlık girişi tek satır olsun: aynı batch_id'li ardışık olaylar birleşir. */
function collapseBatches(items: FeedItem[]): (FeedItem & { count: number })[] {
  const out: (FeedItem & { count: number })[] = [];
  for (const it of items) {
    const batch = it.event.type === "health" ? (it.event.payload as { batchId?: string | null }).batchId : null;
    const last = out[out.length - 1];
    if (batch && last && last.event.type === "health" && (last.event.payload as { batchId?: string | null }).batchId === batch) {
      last.count += 1;
      continue;
    }
    out.push({ ...it, count: 1 });
  }
  return out;
}

export function TodayPage() {
  const user = useAuthStore((s) => s.user);
  const dash = useDashboard();
  const abnormal = useRecentAbnormalObservations();
  const feed = useRecentEvents();
  const sync = useSyncStore();
  const syncInfo = describeSync(sync);
  const d = dash.data;
  const c = d?.counts;
  const critical = (d?.overdue.length ?? 0) + (d?.withdrawal.length ?? 0) + (abnormal.data?.length ?? 0) + (d?.pregnancyChecks.length ?? 0);
  const SyncIcon = sync.status === "syncing" ? RefreshCw : syncInfo.tone === "error" ? TriangleAlert : syncInfo.tone === "warn" ? CloudOff : Check;

  return (
    <>
      <PageHeader
        title={`Merhaba${user ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description={formatDate(new Date())}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/animals/bulk">Toplu sağlık girişi</Link>
            </Button>
            <Button asChild>
              <Link to="/animals/new">Hayvan ekle</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sürü" value={c?.total ?? "–"} hint={c ? `${c.sheep} koyun · ${c.goat} keçi` : undefined} testID="kpi-total" />
        <StatTile label="Dişi / Erkek" value={c ? `${c.female} / ${c.male}` : "–"} hint={c ? `${c.lambs} yavru (6 ay altı)` : undefined} />
        <StatTile label="Gebe" value={c?.pregnant ?? "–"} hint={d?.upcomingBirths.length ? `${d.upcomingBirths.length} doğum 30 gün içinde` : "Yaklaşan doğum yok"} testID="kpi-pregnant" />
        <StatTile label="Bekleyen iş" value={critical} hint={c ? (c.staleWeights ? `${c.staleWeights} hayvan 60 gündür tartılmadı` : "Tartımlar güncel") : undefined} testID="kpi-alerts" />
      </div>

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm",
          syncInfo.tone === "ok" && "bg-card",
          syncInfo.tone === "info" && "bg-accent/40",
          syncInfo.tone === "warn" && "border-warning/40 bg-warning/10",
          syncInfo.tone === "error" && "border-danger/40 bg-danger/10",
        )}
        data-testid="today-sync"
      >
        <SyncIcon className={cn("size-4", sync.status === "syncing" && "animate-spin")} />
        <span className="font-medium">{syncInfo.text ?? "Kayıtlar sunucuyla güncel"}</span>
        <span className="text-muted-foreground">{sync.lastSyncAt ? `Son senkron ${formatRelative(sync.lastSyncAt)}` : "Henüz senkron olmadı"}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => scheduleSync("manual")} disabled={sync.status === "syncing" || !sync.online}>
            Şimdi senkronla
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/settings/sync">Ayrıntı</Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bugünkü işler</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {d && critical === 0 ? <EmptyState title="Bekleyen iş yok" description="Geciken doz, süren arınma, olağandışı gözlem ve bekleyen gebelik kontrolü yok." /> : null}
            {d?.overdue.map((h) => (
              <Row key={h.id} to={`/animals/${h.animalId}`} title={`${h.tagNo} · ${h.productName ?? h.type}`} badge={<Badge variant="destructive">Doz gecikti · {isoToDisplay(h.nextDueAt)}</Badge>} />
            ))}
            {abnormal.data?.map((o) => (
              <Row
                key={o.id}
                to={`/animals/${o.animalId}`}
                title={`${labels.observationCategory[o.category as keyof typeof labels.observationCategory]} · ${(o.tags as string[]).join(", ") || o.note || ""}`}
                badge={<Badge variant="secondary">{labels.severity[o.severity as keyof typeof labels.severity]} · {isoToDisplay(o.observedAt.slice(0, 10))}</Badge>}
              />
            ))}
            {d?.pregnancyChecks.map((b) => (
              <Row key={b.id} to={`/animals/${b.animalId}`} title={`${b.tagNo} · gebelik kontrolü`} badge={<Badge variant="outline">Çiftleşme {isoToDisplay(b.matedAt.slice(0, 10))}</Badge>} />
            ))}
            {d?.withdrawal.map((h) => (
              <Row key={h.id} to={`/animals/${h.animalId}`} title={`${h.tagNo} · ${h.productName ?? "ilaç"}`} badge={<Badge variant="secondary">Arınma · {isoToDisplay(h.withdrawalUntil)}'e kadar</Badge>} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yaklaşan doğumlar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {d && d.upcomingBirths.length === 0 ? <EmptyState title="30 gün içinde beklenen doğum yok" /> : null}
            {d?.upcomingBirths.map((a) => {
              const days = a.expectedBirthAt ? daysUntil(a.expectedBirthAt) : null;
              return (
                <Row
                  key={a.id}
                  to={`/animals/${a.id}`}
                  title={a.name ? `${a.tagNo} · ${a.name}` : a.tagNo}
                  sub={a.expectedBirthAt ? `Beklenen ${isoToDisplay(a.expectedBirthAt)}` : undefined}
                  badge={days == null ? null : <Badge variant={days < 0 ? "destructive" : days <= 7 ? "default" : "outline"}>{days < 0 ? `${-days} gün gecikti` : days === 0 ? "Bugün" : `${days} gün kaldı`}</Badge>}
                />
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Son olaylar</CardTitle>
          </CardHeader>
          <CardContent>
            {feed.data && feed.data.length === 0 ? <EmptyState title="Henüz olay yok" description="Tartım, aşı, gözlem girdikçe burada akar." /> : null}
            <ul className="grid gap-1" data-testid="today-feed">
              {collapseBatches(feed.data ?? []).map((it) => {
                const Icon = eventIcon[it.event.type];
                return (
                  <li key={it.event.id}>
                    <Link to={`/animals/${it.event.animalId}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted" data-testid={`feed-${it.event.type}`}>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{it.count > 1 ? `${it.count} hayvan` : it.tagNo}</span>
                        <span className="text-muted-foreground"> · {it.event.title}</span>
                        {it.event.summary ? <span className="text-muted-foreground"> · {it.event.summary}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(it.recordedAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ to, title, badge, sub }: { to: string; title: string; badge?: React.ReactNode; sub?: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted">
      <div className="grid">
        <span className="font-medium">{title}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </div>
      {badge}
    </Link>
  );
}
