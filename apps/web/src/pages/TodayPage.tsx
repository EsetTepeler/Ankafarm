import { formatKg } from "@anka/shared";
import { Link } from "react-router";

import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/features/dashboard/repo";
import { useRecentAbnormalObservations } from "@/features/observations/repo";
import { labels } from "@anka/shared";
import { useAuthStore } from "@/lib/auth";
import { formatDate, isoToDisplay } from "@/utils/date";

export function TodayPage() {
  const user = useAuthStore((s) => s.user);
  const dash = useDashboard();
  const abnormal = useRecentAbnormalObservations();
  const d = dash.data;
  const c = d?.counts;
  const critical = (d?.overdue.length ?? 0) + (d?.withdrawal.length ?? 0) + (abnormal.data?.length ?? 0);

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
        <StatTile label="Sağlık uyarısı" value={critical} hint={c?.notWeighed ? `${c.notWeighed} hayvan hiç tartılmadı` : "Tüm hayvanlar tartıldı"} testID="kpi-alerts" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bugünkü işler</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {d && critical === 0 ? <EmptyState title="Bekleyen iş yok" description="Geciken doz ve süren arınma yok." /> : null}
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
            {d?.upcomingBirths.map((a) => (
              <Row key={a.id} to={`/animals/${a.id}`} title={a.name ? `${a.tagNo} · ${a.name}` : a.tagNo} badge={<Badge variant="outline">{isoToDisplay(a.expectedBirthAt)}</Badge>} />
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Son tartımlar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d && d.recentWeights.length === 0 ? <EmptyState title="Henüz tartım yok" /> : null}
            {d?.recentWeights.map((w) => (
              <Row key={w.id} to={`/animals/${w.animalId}`} title={w.tagNo} badge={<span className="text-sm font-medium">{formatKg(w.weightKg)}</span>} sub={formatDate(w.weighedAt)} />
            ))}
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
