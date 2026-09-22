import { formatMoney, formatNumber, formatQuantity, labels, type StockCategory, type StockUnit } from "@anka/shared";
import { Hourglass, Package, Pencil, Plus, ShoppingCart, Trash2, TriangleAlert, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatGrid, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsumptionDialog } from "@/features/stock/ConsumptionDialog";
import { PurchaseDialog } from "@/features/stock/PurchaseDialog";
import { StockItemDialog } from "@/features/stock/StockItemDialog";
import { deleteConsumption, deletePurchase, deleteStockItem, useConsumptions, usePurchases, useStockLevels, type StockLevel } from "@/features/stock/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { isoToDisplay } from "@/utils/date";

/** Kalan güne göre ton: bir haftadan az kırmızı, iki haftadan az sarı. */
function daysTone(days: number | null): "danger" | "warn" | "muted" {
  if (days == null) return "muted";
  if (days <= 7) return "danger";
  if (days <= 14) return "warn";
  return "muted";
}

export function StockPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === "owner";
  const levels = useStockLevels();
  const purchases = usePurchases();
  const consumptions = useConsumptions();
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<StockLevel | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [consumptionOpen, setConsumptionOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  /**
   * Finans ekranındaki "yem aldım / sürüye verdim" yönlendirmesi doğrudan doğru diyaloğu açsın;
   * kullanıcıyı Stok listesine bırakıp düğmeyi kendisi bulsun demek aynı kaybolmayı tekrarlatır.
   */
  useEffect(() => {
    const ekle = params.get("ekle");
    if (!ekle) return;
    if (ekle === "alim") setPurchaseOpen(true);
    if (ekle === "tuketim") setConsumptionOpen(true);
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("ekle");
      return next;
    });
  }, [params, setParams]);

  const rows = levels.data ?? [];
  const low = rows.filter((r) => r.belowMin || (r.daysLeft != null && r.daysLeft <= 14));
  const soonest = rows.filter((r) => r.daysLeft != null).sort((a, b) => a.daysLeft! - b.daysLeft!)[0];

  async function remove(item: StockLevel) {
    try {
      await deleteStockItem(item.id);
      toast.success(`${item.name} silindi`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Stok"
        description="Yem, su ve malzeme; alım, tüketim ve kalan gün"
        actions={
          <>
            <Button variant="outline" onClick={() => setConsumptionOpen(true)} data-testid="consumption-add">
              <Utensils /> Toplu tüketim
            </Button>
            {isOwner ? (
              <Button onClick={() => setPurchaseOpen(true)} data-testid="purchase-add">
                <ShoppingCart /> Alım ekle
              </Button>
            ) : null}
          </>
        }
      />

      <StatGrid className="lg:grid-cols-3">
        <StatTile label="Kalem" value={rows.filter((r) => r.active).length} hint={`${rows.filter((r) => r.active && r.trackStock).length} kalemde bakiye tutuluyor`} testID="kpi-items" />
        <StatTile label="Uyarı" value={low.length} hint={low.length ? low.map((r) => r.name).join(", ") : "Stok seviyeleri yeterli"} testID="kpi-low" tone={low.length ? "warning" : "success"} />
        <StatTile
          label="İlk biten"
          value={soonest ? `${soonest.daysLeft} gün` : "–"}
          hint={soonest ? `${soonest.name} · ${formatQuantity(soonest.balance ?? 0, soonest.unit)}` : "Tüketim girilince hesaplanır"}
          testID="kpi-soonest"
          tone={soonest?.daysLeft == null ? "default" : soonest.daysLeft <= 7 ? "danger" : soonest.daysLeft <= 14 ? "warning" : "success"}
        />
      </StatGrid>

      <Tabs defaultValue="levels" className="mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="levels" data-testid="tab-levels">
            Seviyeler
          </TabsTrigger>
          <TabsTrigger value="purchases" data-testid="tab-purchases">
            Alımlar
          </TabsTrigger>
          <TabsTrigger value="consumptions" data-testid="tab-consumptions">
            Tüketim
          </TabsTrigger>
        </TabsList>

        <TabsContent value="levels">
          <div className="mb-3 flex justify-end">
            {isOwner ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setItemOpen(true);
                }}
                data-testid="item-add"
              >
                <Plus /> Kalem ekle
              </Button>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Henüz kalem yok" description="Yonca, saman, arpa ve su kalemleri çiftlik açılışında eklenir." />
          ) : (
            <div className="overflow-hidden border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kalem</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead className="text-right">Bakiye</TableHead>
                    <TableHead className="text-right">Son 14 gün</TableHead>
                    <TableHead className="text-right">Kalan gün</TableHead>
                    <TableHead className="text-right">Alt sınır</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const tone = daysTone(r.daysLeft);
                    return (
                      <TableRow key={r.id} data-testid={`stock-row-${r.name}`}>
                        <TableCell className="font-medium">
                          <span className={cn("flex items-center gap-2", !r.active && "text-muted-foreground")}>
                            <Package className="size-4 text-muted-foreground" />
                            {r.name}
                            {!r.active ? <Badge variant="outline">Pasif</Badge> : null}
                          </span>
                        </TableCell>
                        <TableCell>{labels.stockCategory[r.category as StockCategory] ?? r.category}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", r.belowMin && "font-semibold text-danger")} data-testid={`stock-balance-${r.name}`}>
                          {r.balance == null ? <span className="text-muted-foreground">takip yok</span> : formatQuantity(r.balance, r.unit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.consumedInWindow ? formatQuantity(r.consumedInWindow, r.unit) : "–"}</TableCell>
                        <TableCell className="text-right">
                          {r.daysLeft == null ? (
                            <span className="text-muted-foreground">–</span>
                          ) : (
                            <Badge variant={tone === "danger" ? "destructive" : tone === "warn" ? "default" : "outline"} data-testid={`stock-days-${r.name}`}>
                              {r.daysLeft} gün
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.minStock != null ? formatNumber(r.minStock) : "–"}</TableCell>
                        <TableCell className="text-right">
                          {isOwner ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Düzenle"
                                onClick={() => {
                                  setEditing(r);
                                  setItemOpen(true);
                                }}
                                data-testid={`item-edit-${r.name}`}
                              >
                                <Pencil />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Sil" onClick={() => void remove(r)}>
                                <Trash2 />
                              </Button>
                            </>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchases">
          {purchases.data?.length === 0 ? (
            <EmptyState title="Henüz alım yok" />
          ) : (
            <div className="overflow-hidden border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Kalem</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead className="text-right">Birim</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                    <TableHead>Satıcı</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchases.data ?? []).map(({ purchase: p, itemName, unit }) => (
                    <TableRow key={p.id} data-testid={`purchase-row-${itemName}`}>
                      <TableCell>{isoToDisplay(p.purchasedAt)}</TableCell>
                      <TableCell className="font-medium">{itemName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(p.quantity, unit as StockUnit)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.unitPrice != null ? formatMoney(p.unitPrice) : "–"}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{p.total != null ? formatMoney(p.total) : "–"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.supplier ?? "–"}</TableCell>
                      <TableCell className="text-right">
                        {isOwner ? (
                          <Button variant="ghost" size="icon" aria-label="Sil" onClick={() => void deletePurchase(p.id)}>
                            <Trash2 />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="consumptions">
          {consumptions.data?.length === 0 ? (
            <EmptyState title="Henüz tüketim girilmedi" description="Günlük turda oluğa konan yemi tek ekrandan gir." />
          ) : (
            <div className="overflow-hidden border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Kalem</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                    <TableHead>Kapsam</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(consumptions.data ?? []).map(({ consumption: c, itemName, unit }) => (
                    <TableRow key={c.id} data-testid={`consumption-row-${itemName}`}>
                      <TableCell>{isoToDisplay(c.consumedOn)}</TableCell>
                      <TableCell className="font-medium">{itemName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(c.quantity, unit as StockUnit)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.animalId ? "Tek hayvan" : c.groupId ? "Grup" : "Tüm sürü"}</TableCell>
                      <TableCell className="text-right">
                        {isOwner ? (
                          <Button variant="ghost" size="icon" aria-label="Sil" onClick={() => void deleteConsumption(c.id)}>
                            <Trash2 />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <StockItemDialog open={itemOpen} onOpenChange={setItemOpen} item={editing} />
      <PurchaseDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
      <ConsumptionDialog open={consumptionOpen} onOpenChange={setConsumptionOpen} />
    </>
  );
}
