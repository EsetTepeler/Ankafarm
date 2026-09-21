import { formatKg, formatNumber, labels, type AnimalStatus } from "@anka/shared";
import { Baby, HeartHandshake } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBreedingPerformance, type DamStats, type SireStats } from "@/features/breeding/report";
import { cn } from "@/lib/utils";
import { isoToDisplay } from "@/utils/date";

const pct = (v: number | null) => (v == null ? "–" : `%${Math.round(v * 100)}`);
const num = (v: number | null, digits = 2) => (v == null ? "–" : formatNumber(Math.round(v * 10 ** digits) / 10 ** digits));

/** Damızlık analitiği (madde 3.7): koç ve anne performansı, koç adaylarını yan yana karşılaştırma. */
export function BreedingPage() {
  const perf = useBreedingPerformance();
  const [compare, setCompare] = useState<Set<string>>(new Set());

  const sires = perf.data?.sires ?? [];
  const dams = perf.data?.dams ?? [];
  const selected = sires.filter((s) => compare.has(s.id));
  const pregnant = dams.filter((d) => d.isPregnant);
  const herdPerBirth = dams.length ? dams.reduce((s, d) => s + d.lambs, 0) / Math.max(1, dams.reduce((s, d) => s + d.births, 0)) : null;

  function toggle(id: string) {
    setCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader title="Damızlık" description="Koç ve anne performansı; akrabalık kontrolü çiftleşme formunda" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Damızlık koç" value={sires.length} hint={sires.filter((s) => s.status === "active").length + " aktif"} testID="sire-count" />
        <StatTile label="Doğum yapan anne" value={dams.filter((d) => d.births > 0).length} hint={`${pregnant.length} gebe`} testID="dam-count" />
        <StatTile label="Doğum başına yavru" value={num(herdPerBirth)} hint="Sürü ortalaması" />
        <StatTile label="Toplam yavru" value={dams.reduce((s, d) => s + d.lambs, 0)} hint={`${dams.reduce((s, d) => s + d.stillborn, 0)} ölü doğum`} />
      </div>

      <Tabs defaultValue="sires" className="mt-6">
        <TabsList>
          <TabsTrigger value="sires" data-testid="tab-sires">
            Koçlar
          </TabsTrigger>
          <TabsTrigger value="dams" data-testid="tab-dams">
            Anneler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sires">
          {sires.length === 0 ? (
            <EmptyState title="Damızlık koç kaydı yok" description="Çiftleşme veya doğum kaydı girilince koçlar burada listelenir." />
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Küpe</TableHead>
                      <TableHead className="text-right">Eş</TableHead>
                      <TableHead className="text-right">Doğum</TableHead>
                      <TableHead className="text-right">Yavru</TableHead>
                      <TableHead className="text-right">Doğum başına</TableHead>
                      <TableHead className="text-right">Yaşama</TableHead>
                      <TableHead className="text-right">Doğum kilosu</TableHead>
                      <TableHead className="text-right">Günlük artış</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sires.map((s) => (
                      <TableRow key={s.id} data-testid={`sire-row-${s.tagNo}`}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={compare.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`${s.tagNo} karşılaştır`} data-testid={`sire-compare-${s.tagNo}`} />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link to={`/animals/${s.id}`} className="hover:underline">
                            {s.tagNo}
                            {s.name ? <span className="text-muted-foreground"> · {s.name}</span> : null}
                          </Link>
                          {s.status !== "active" ? (
                            <Badge variant="outline" className="ml-2">
                              {labels.animalStatus[s.status as AnimalStatus] ?? s.status}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.mates}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.births}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{s.lambs}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(s.perBirth)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(s.survival)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.birthWeight != null ? formatKg(Math.round(s.birthWeight * 10) / 10) : "–"}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.adg != null ? `${Math.round(s.adg)} g` : "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selected.length > 0 ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="sire-comparison">
                  {selected.map((s) => (
                    <SireCard key={s.id} sire={s} best={selected.reduce((m, x) => Math.max(m, x.lambs), 0)} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Koç adaylarını yan yana görmek için satırlardaki kutuları işaretle.</p>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="dams">
          {dams.length === 0 ? (
            <EmptyState title="Doğum kaydı yok" />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Küpe</TableHead>
                    <TableHead className="text-right">Doğum</TableHead>
                    <TableHead className="text-right">Yavru</TableHead>
                    <TableHead className="text-right">Doğum başına</TableHead>
                    <TableHead className="text-right">Yaşama</TableHead>
                    <TableHead className="text-right">Doğum aralığı</TableHead>
                    <TableHead>Son doğum</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dams.map((d) => (
                    <TableRow key={d.id} data-testid={`dam-row-${d.tagNo}`}>
                      <TableCell className="font-medium">
                        <Link to={`/animals/${d.id}`} className="hover:underline">
                          {d.tagNo}
                          {d.name ? <span className="text-muted-foreground"> · {d.name}</span> : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.births}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{d.lambs}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(d.perBirth)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(d.survival)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", d.interval != null && d.interval > 400 && "text-warning")}>{d.interval != null ? `${Math.round(d.interval)} gün` : "–"}</TableCell>
                      <TableCell className="text-muted-foreground">{d.lastBirth ? isoToDisplay(d.lastBirth) : "–"}</TableCell>
                      <TableCell>
                        {d.isPregnant ? (
                          <Badge variant="secondary" className="gap-1">
                            <Baby className="size-3.5" />
                            {d.expectedBirthAt ? isoToDisplay(d.expectedBirthAt) : "Gebe"}
                          </Badge>
                        ) : d.status !== "active" ? (
                          <Badge variant="outline">{labels.animalStatus[d.status as AnimalStatus] ?? d.status}</Badge>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function SireCard({ sire, best }: { sire: SireStats; best: number }) {
  const rows: [string, string][] = [
    ["Çiftleştiği dişi", String(sire.mates)],
    ["Doğum", String(sire.births)],
    ["Canlı yavru", String(sire.lambs)],
    ["Doğum başına", num(sire.perBirth)],
    ["Yaşama oranı", pct(sire.survival)],
    ["Ortalama doğum kilosu", sire.birthWeight != null ? formatKg(Math.round(sire.birthWeight * 10) / 10) : "–"],
    ["Yavru günlük artış", sire.adg != null ? `${Math.round(sire.adg)} g` : "–"],
    ["Sürüde yaşayan yavru", String(sire.aliveOffspring)],
    ["Son doğum", sire.lastBirth ? isoToDisplay(sire.lastBirth) : "–"],
  ];
  return (
    <Card className={cn(sire.lambs === best && best > 0 && "border-primary")} data-testid={`sire-card-${sire.tagNo}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartHandshake className="size-4 text-muted-foreground" />
          {sire.tagNo}
          {sire.name ? <span className="font-normal text-muted-foreground">· {sire.name}</span> : null}
          {sire.lambs === best && best > 0 ? <Badge className="ml-auto">En çok yavru</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
