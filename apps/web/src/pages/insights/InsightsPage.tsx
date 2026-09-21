import { Check, CircleAlert, Clock, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { severityLabels, useInsightActions, useInsights, type InsightSeverity } from "@/features/insights/repo";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/utils/date";

export interface InsightRow {
  id: string;
  animalId: string | null;
  tagNo: string | null;
  type: string;
  severity: string;
  title: string;
  message: string;
  computedAt: string | Date;
}

/** Şiddet rengi kartın soluna kalın bir şerit olarak düşer; liste yukarıdan aşağı taranırken ayırt etmesi kolay. */
const tone: Record<InsightSeverity, string> = {
  critical: "border-danger/40 bg-danger/5 border-l-4 border-l-danger",
  warning: "border-warning/40 bg-warning/5 border-l-4 border-l-warning",
  info: "border-l-4 border-l-border",
};

/** İçgörüler (madde 5.10): kural motorunun bulguları, şiddet sırasına göre. */
export function InsightsPage() {
  const insights = useInsights({ limit: 100 });
  const rows = (insights.data ?? []) as InsightRow[];
  const counts = {
    critical: rows.filter((r) => r.severity === "critical").length,
    warning: rows.filter((r) => r.severity === "warning").length,
    info: rows.filter((r) => r.severity === "info").length,
  };

  return (
    <>
      <PageHeader icon={Lightbulb} title="İçgörüler" description="Kayıtlardan çıkan bulgular; teşhis değil, dikkat çekilen noktalar" />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Acil" value={counts.critical} hint={counts.critical ? "Bugün bak" : "Acil bulgu yok"} testID="insight-critical" icon={TriangleAlert} tone={counts.critical ? "danger" : "success"} />
        <StatTile label="Dikkat" value={counts.warning} testID="insight-warning" icon={CircleAlert} tone={counts.warning ? "warning" : "default"} />
        <StatTile label="Bilgi" value={counts.info} testID="insight-info" icon={Info} />
      </div>

      {insights.isError ? <p className="mt-4 text-sm text-muted-foreground">İçgörüler sunucudan gelir; bağlantı kurulunca görünür.</p> : null}

      <div className="mt-6 grid gap-2" data-testid="insight-list">
        {!insights.isLoading && rows.length === 0 ? (
          <EmptyState icon={Lightbulb} title="Şimdilik bir bulgu yok" description="Kilo, yem ve sağlık kayıtları biriktikçe burada uyarılar çıkar." />
        ) : null}
        {rows.map((row) => (
          <InsightCard key={row.id} row={row} />
        ))}
      </div>
    </>
  );
}

export function InsightCard({ row, compact }: { row: InsightRow; compact?: boolean }) {
  const { acknowledge, snooze } = useInsightActions();
  const severity = (row.severity as InsightSeverity) ?? "info";
  const Icon = severity === "info" ? Lightbulb : TriangleAlert;

  return (
    <Card className={cn("overflow-hidden py-0 transition-shadow hover:shadow-xs", tone[severity])} data-testid={`insight-${row.type}`}>
      <CardContent className={cn("grid gap-1 px-4 py-3", compact && "px-3 py-2")}>
        <div className="flex flex-wrap items-center gap-2">
          <Icon className={cn("size-4", severity === "critical" ? "text-danger" : severity === "warning" ? "text-warning" : "text-muted-foreground")} />
          <span className="font-medium">{row.title}</span>
          <Badge
            variant={severity === "critical" ? "destructive" : "outline"}
            className={cn(severity === "warning" && "border-warning/45 bg-warning/15 font-medium text-warning")}
          >
            {severityLabels[severity]}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">{formatRelative(row.computedAt as string)}</span>
        </div>
        <p className="text-sm text-muted-foreground">{row.message}</p>
        {!compact ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {row.animalId ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/animals/${row.animalId}`}>{row.tagNo ?? "Hayvanı aç"}</Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => acknowledge.mutate({ id: row.id, undo: false }, { onSuccess: () => toast.success("Okundu olarak işaretlendi") })}
              disabled={acknowledge.isPending}
              data-testid="insight-ack"
            >
              <Check /> Okudum
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => snooze.mutate({ id: row.id, days: 7 }, { onSuccess: () => toast.info("Bir hafta ertelendi") })}
              disabled={snooze.isPending}
              data-testid="insight-snooze"
            >
              <Clock /> Ertele
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
