import { formatKg, formatMoney, formatNumber } from "@anka/shared";
import { Baby, BarChart3, Coins, LogOut, Scale, Syringe, Users } from "lucide-react";
import { useMemo } from "react";

import { BarChart, DonutChart, TrendChart } from "@/charts/Charts";
import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCostEfficiency, useHerdStructure, useMonthlyConsumption, useMonthlyMoney, useProductionReport } from "@/features/reports/repo";
import { useAuthStore } from "@/lib/auth";

/** Raporlar: sürü, üretim ve para. Hepsi cihazdaki veriden hesaplanır, çevrimdışı çalışır. */
export function ReportsPage() {
  const isOwner = useAuthStore((s) => s.user?.role) === "owner";
  const herd = useHerdStructure();
  const money = useMonthlyMoney(12);
  const consumption = useMonthlyConsumption(6);
  const production = useProductionReport();
  const efficiency = useCostEfficiency(6);

  const moneySeries = useMemo(
    () => (money.data ?? []).flatMap((m) => [{ label: m.label, series: "Gider", value: Math.round(m.expense) }, { label: m.label, series: "Gelir", value: Math.round(m.income) }]),
    [money.data],
  );
  const consumptionSeries = useMemo(() => (consumption.data ?? []).map((c) => ({ label: c.label, series: c.item, value: c.quantity })), [consumption.data]);
  const totals = useMemo(() => {
    const rows = money.data ?? [];
    return { expense: rows.reduce((s, m) => s + m.expense, 0), income: rows.reduce((s, m) => s + m.income, 0) };
  }, [money.data]);

  const h = herd.data;
  const p = production.data;

  return (
    <>
      <PageHeader icon={BarChart3} title="Raporlar" description="Sürü yapısı, üretim ve para; son 12 ay" />

      <Tabs defaultValue="herd">
        <TabsList className="mb-4">
          <TabsTrigger value="herd" data-testid="tab-herd">
            Sürü
          </TabsTrigger>
          <TabsTrigger value="production" data-testid="tab-production">
            Üretim
          </TabsTrigger>
          {isOwner ? (
            <TabsTrigger value="money" data-testid="tab-money">
              Para
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="herd">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Aktif sürü" value={h?.total ?? "–"} hint={h ? h.bySpecies.map((s) => `${s.value} ${s.name.toLocaleLowerCase("tr")}`).join(" · ") : undefined} testID="report-total" icon={Users} tone="brand" />
            <StatTile label="Dişi / Erkek" value={h ? h.bySex.map((s) => s.value).join(" / ") : "–"} hint={h?.bySex.map((s) => s.name).join(" / ")} />
            <StatTile label="Ortalama kilo" value={h?.avgWeight != null ? formatKg(Math.round(h.avgWeight * 10) / 10) : "–"} hint={h ? `${h.weighed} hayvan tartıldı` : undefined} testID="report-weight" icon={Scale} />
            <StatTile label="Irk" value={h?.byBreed.length ?? "–"} hint={h?.byBreed[0] ? `En çok ${h.byBreed[0].name}` : undefined} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Yaş grupları</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={h?.byAge ?? []} testID="chart-age" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Irk dağılımı</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={h?.byBreed ?? []} testID="chart-breed" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="production">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Doğum" value={p?.births ?? "–"} hint={p ? `${p.live} canlı · ${p.stillborn} ölü doğum` : undefined} testID="report-births" icon={Baby} />
            <StatTile label="Doğum başına yavru" value={p ? formatNumber(Math.round(p.perBirth * 100) / 100) : "–"} />
            <StatTile label="Yaşama oranı" value={p?.survival != null ? `%${Math.round(p.survival * 100)}` : "–"} />
            <StatTile label="Sağlık gideri" value={p ? formatMoney(p.healthCost) : "–"} hint={p ? `${p.health.reduce((s, x) => s + x.count, 0)} kayıt` : undefined} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aylık doğan yavru</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={p?.birthsByMonth ?? []} testID="chart-births" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Doğum zorluğu</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart data={p?.byDifficulty ?? []} testID="chart-difficulty" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sağlık kayıtları</CardTitle>
              </CardHeader>
              <CardContent>
                {p && p.health.length === 0 ? <EmptyState icon={Syringe} title="Henüz sağlık kaydı yok" /> : null}
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Tür</TableHead>
                      <TableHead className="text-right">Kayıt</TableHead>
                      <TableHead className="text-right">Maliyet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(p?.health ?? []).map((row) => (
                      <TableRow key={row.name}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(row.cost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sürüden çıkışlar</CardTitle>
              </CardHeader>
              <CardContent>
                {p && p.exits.length === 0 ? <EmptyState icon={LogOut} title="Çıkış kaydı yok" /> : null}
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Neden</TableHead>
                      <TableHead className="text-right">Hayvan</TableHead>
                      <TableHead className="text-right">Gelir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(p?.exits ?? []).map((row) => (
                      <TableRow key={row.name}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.income ? formatMoney(row.income) : "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {isOwner ? (
          <TabsContent value="money">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label="12 ay gider" value={formatMoney(totals.expense)} hint="Alımlar ve stok dışı giderler" testID="report-expense" icon={Coins} />
              <StatTile label="12 ay gelir" value={formatMoney(totals.income)} testID="report-income" icon={Coins} />
              <StatTile
                label="Denge"
                value={formatMoney(totals.income - totals.expense)}
                hint={totals.income >= totals.expense ? "Artıda" : "Ekside"}
                icon={Scale}
                tone={totals.income >= totals.expense ? "success" : "danger"}
              />
            </div>
            <div className="mt-4 grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Aylık gider ve gelir</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart data={moneySeries} kind="bar" unit="TL" testID="chart-money" height={280} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kalem bazında aylık tüketim</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart data={consumptionSeries} testID="chart-consumption" height={280} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Hayvan başı maliyet ve yem verimliliği</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table data-testid="table-efficiency">
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead>Ay</TableHead>
                          <TableHead className="text-right">Gider</TableHead>
                          <TableHead className="text-right">Hayvan</TableHead>
                          <TableHead className="text-right">Hayvan başı</TableHead>
                          <TableHead className="text-right">Yem gideri</TableHead>
                          <TableHead className="text-right">Kilo artışı</TableHead>
                          <TableHead className="text-right">kg başına yem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(efficiency.data ?? []).map((m) => (
                          <TableRow key={m.month} data-testid={`efficiency-row-${m.month}`}>
                            <TableCell className="font-medium">{m.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.cost ? formatMoney(m.cost) : "–"}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.animals}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.costPerAnimal ? formatMoney(Math.round(m.costPerAnimal)) : "–"}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.feedCost ? formatMoney(Math.round(m.feedCost)) : "–"}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.weightGain ? formatKg(Math.round(m.weightGain * 10) / 10) : "–"}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{m.costPerKg ? formatMoney(Math.round(m.costPerKg * 10) / 10) : "–"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Yem gideri tüketimden hesaplanır: kalem başına ortalama birim fiyat çarpı o ay tüketilen miktar. Toplu alım maliyeti tek aya yığılmaz, yedikçe dağılır.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}
