import { useQuery } from "@tanstack/react-query";
import { desc } from "drizzle-orm";
import { RefreshCw } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { describeSync, useSyncStore } from "@/sync/store";
import { discardFailed, retryFailed, syncNow } from "@/sync/worker";
import { formatDateTime } from "@/utils/date";

export function SyncPage() {
  const sync = useSyncStore();
  const { text } = describeSync(sync);
  const rows = useQuery({
    queryKey: ["local", "outbox", sync.pending, sync.failed, sync.status],
    queryFn: () => getDb().select().from(outbox).orderBy(desc(outbox.clientCreatedAt)).limit(100),
  });

  return (
    <>
      <PageHeader
        title="Senkron durumu"
        description={text ?? (sync.lastSyncAt ? `Güncel · son senkron ${formatDateTime(sync.lastSyncAt)}` : "Henüz senkron olmadı")}
        actions={
          <Button onClick={() => void syncNow("manual")} disabled={sync.status === "syncing"}>
            <RefreshCw className={sync.status === "syncing" ? "animate-spin" : ""} /> Şimdi senkronla
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bağlantı</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{sync.online ? (sync.serverReachable ? "Sunucuya ulaşılıyor" : "Sunucu yanıt vermiyor") : "Çevrimdışı"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bekleyen</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{sync.pending}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Reddedilen</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{sync.failed}</CardContent>
        </Card>
      </div>
      {sync.lastError ? <p className="mb-4 text-sm text-danger">{sync.lastError}</p> : null}

      {(rows.data ?? []).length === 0 ? (
        <EmptyState title="Kuyruk boş" description="Her şey sunucuda." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tablo</TableHead>
                <TableHead>İşlem</TableHead>
                <TableHead>Kayıt</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Zaman</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows.data ?? []).map((r) => (
                <TableRow key={r.mutationId}>
                  <TableCell>{r.table}</TableCell>
                  <TableCell>{r.op}</TableCell>
                  <TableCell className="font-mono text-xs">{r.rowId.slice(0, 8)}</TableCell>
                  <TableCell>
                    {r.status === "failed" ? <Badge variant="destructive">{r.rejectionCode ?? "reddedildi"}</Badge> : <Badge variant="secondary">bekliyor</Badge>}
                    {r.lastError ? <span className="ml-2 text-xs text-muted-foreground">{r.lastError}</span> : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.clientCreatedAt)}</TableCell>
                  <TableCell className="text-right">
                    {r.status === "failed" ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => void retryFailed(r.mutationId)}>
                          Yeniden dene
                        </Button>
                        <Button variant="ghost" size="sm" className="text-danger" onClick={() => void discardFailed(r.mutationId)}>
                          Sil
                        </Button>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
