import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Ban, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";
import { formatDateTime } from "@/utils/date";

const statusLabels = { pending: "Bekliyor", accepted: "Kabul edildi", rejected: "Reddedildi", cancelled: "İptal edildi" } as const;
type TransferStatus = keyof typeof statusLabels;

/**
 * Çiftlikler arası hayvan devri (7.6). Sunucuya bağlı çalışır, çevrimdışı değil:
 * karar iki kiracıya birden dokunuyor, cihazda verilemez.
 */
export function TransfersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isOwner = useAuthStore((s) => s.user?.role) === "owner";
  const [accepting, setAccepting] = useState<{ id: string; tagNo: string; newTagNo: string } | null>(null);

  const incoming = useQuery({ ...trpc.transfers.incoming.queryOptions(), retry: false });
  const outgoing = useQuery({ ...trpc.transfers.outgoing.queryOptions(), retry: false });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.transfers.incoming.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.transfers.outgoing.queryKey() });
  };

  const accept = useMutation(
    trpc.transfers.accept.mutationOptions({
      onSuccess: (r) => {
        refresh();
        setAccepting(null);
        toast.success(`${r.tagNo} sürüne katıldı`, {
          description: `${r.movedHealth} sağlık, ${r.movedWeights} tartım kaydı birlikte geldi. Kayıtlar cihazına ilk senkronda iner.`,
        });
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );
  const reject = useMutation(
    trpc.transfers.reject.mutationOptions({
      onSuccess: () => {
        refresh();
        toast.success("Devir reddedildi");
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );
  const cancel = useMutation(
    trpc.transfers.cancel.mutationOptions({
      onSuccess: () => {
        refresh();
        toast.success("Devir isteği geri çekildi");
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );

  const inRows = incoming.data ?? [];
  const outRows = outgoing.data ?? [];
  const pendingIn = inRows.filter((t) => t.status === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow="Sürü"
        title="Devirler"
        description="Hayvanın başka bir çiftliğe geçişi. Gönderen taraf başlatır, alan taraf kabul eder; kabul edilene kadar hayvan yerinde kalır."
      />

      {incoming.isError ? (
        <EmptyState title="Devirler alınamadı" description="Bu ekran sunucuya bağlı çalışır; bağlantı gelince yeniden dene." />
      ) : (
        <Tabs defaultValue="incoming">
          <TabsList className="mb-4">
            <TabsTrigger value="incoming" data-testid="tab-incoming">
              <ArrowDownLeft /> Gelen
              {pendingIn ? <Badge variant="default">{pendingIn}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="outgoing" data-testid="tab-outgoing">
              <ArrowUpRight /> Giden
            </TabsTrigger>
          </TabsList>

          <TabsContent value="incoming">
            {inRows.length === 0 ? (
              <EmptyState title={incoming.isLoading ? "Yükleniyor" : "Gelen devir yok"} description="Başka bir çiftlik sana hayvan devrederse burada çıkar." />
            ) : (
              <TransferTable
                rows={inRows}
                direction="incoming"
                testIdPrefix="in"
                actions={(t) =>
                  t.status !== "pending" || !isOwner ? null : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Kabul et"
                        data-testid={`accept-${t.tagNo}`}
                        onClick={() => setAccepting({ id: t.id, tagNo: t.tagNo, newTagNo: "" })}
                      >
                        <Check />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Reddet"
                        data-testid={`reject-${t.tagNo}`}
                        disabled={reject.isPending}
                        onClick={() => reject.mutate({ transferId: t.id })}
                      >
                        <X />
                      </Button>
                    </>
                  )
                }
              />
            )}
          </TabsContent>

          <TabsContent value="outgoing">
            {outRows.length === 0 ? (
              <EmptyState title={outgoing.isLoading ? "Yükleniyor" : "Giden devir yok"} description="Hayvan profilinden 'Başka çiftliğe devret' ile başlatılır." />
            ) : (
              <TransferTable
                rows={outRows}
                direction="outgoing"
                testIdPrefix="out"
                actions={(t) =>
                  t.status !== "pending" || !isOwner ? null : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Geri çek"
                      data-testid={`cancel-${t.tagNo}`}
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate({ transferId: t.id })}
                    >
                      <Ban />
                    </Button>
                  )
                }
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={accepting != null} onOpenChange={(o) => !o && setAccepting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Devri kabul et</DialogTitle>
            <DialogDescription>
              {accepting?.tagNo} sürüne katılacak. Aşı ve tartım geçmişi birlikte gelir; gönderen çiftliğin masrafları ve gözlem notları gelmez.
            </DialogDescription>
          </DialogHeader>
          {accepting ? (
            <div className="grid gap-1.5">
              <Label htmlFor="accept-tag">Küpe numarası</Label>
              <Input
                id="accept-tag"
                value={accepting.newTagNo}
                onChange={(e) => setAccepting({ ...accepting, newTagNo: e.target.value })}
                placeholder={accepting.tagNo}
                className="font-mono"
                data-testid="accept-tag"
              />
              <p className="text-xs text-muted-foreground">Boş bırakırsan {accepting.tagNo} olarak gelir. Bu küpe sende doluysa yeni bir numara ver.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccepting(null)}>
              Vazgeç
            </Button>
            <Button
              disabled={accept.isPending}
              data-testid="accept-save"
              onClick={() => {
                if (!accepting) return;
                accept.mutate({ transferId: accepting.id, newTagNo: accepting.newTagNo.trim() || undefined });
              }}
            >
              <Check /> Sürüme kat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TransferRow {
  id: string;
  tagNo: string;
  newTagNo: string | null;
  status: string;
  note: string | null;
  decisionNote: string | null;
  requestedAt: Date | string;
  decidedAt: Date | string | null;
  otherFarmName: string;
  otherFarmCode: string;
}

function TransferTable({
  rows,
  direction,
  actions,
  testIdPrefix,
}: {
  rows: TransferRow[];
  direction: "incoming" | "outgoing";
  actions: (t: TransferRow) => React.ReactNode;
  testIdPrefix: string;
}) {
  return (
    <div className="overflow-hidden border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Küpe</TableHead>
            <TableHead>{direction === "incoming" ? "Gönderen" : "Alan"}</TableHead>
            <TableHead>Not</TableHead>
            <TableHead>İstek</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="w-20 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id} data-testid={`${testIdPrefix}-row-${t.tagNo}`}>
              <TableCell className="font-mono text-[13px] font-medium">
                {t.tagNo}
                {t.newTagNo ? <span className="text-muted-foreground"> → {t.newTagNo}</span> : null}
              </TableCell>
              <TableCell>
                {t.otherFarmName}
                <span className="block font-mono text-xs text-muted-foreground">{t.otherFarmCode}</span>
              </TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">{t.note ?? t.decisionNote ?? "–"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(t.requestedAt as string)}</TableCell>
              <TableCell>
                <Badge variant={t.status === "pending" ? "default" : t.status === "accepted" ? "outline" : "secondary"}>
                  {statusLabels[t.status as TransferStatus] ?? t.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{actions(t)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
