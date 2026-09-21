import { labels, type SyncedTable } from "@anka/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";
import { formatDateTime, isoToDisplay } from "@/utils/date";

const tableLabels: Partial<Record<SyncedTable | string, string>> = {
  breeds: "Irk",
  groups: "Grup",
  animals: "Hayvan",
  group_movements: "Grup değişimi",
  weight_records: "Tartım",
  health_records: "Sağlık kaydı",
  breeding_records: "Çiftleşme",
  lambing_records: "Doğum",
  exit_records: "Sürüden çıkış",
  observations: "Gözlem",
  observation_tags: "Gözlem etiketi",
  stock_items: "Stok kalemi",
  purchases: "Alım",
  consumptions: "Tüketim",
  expenses: "Gider",
  incomes: "Gelir",
};

/** Trigger `TG_OP` değerini küçük harfle yazıyor; yine de ikisini de karşılayalım. */
const actionLabels: Record<string, string> = { INSERT: "eklendi", UPDATE: "değişti", DELETE: "silindi" };
const actionLabel = (action: string) => actionLabels[action.toUpperCase()] ?? action;

/** Alan adları Türkçe; listede olmayan alan ham adıyla görünür. */
const fieldLabels: Record<string, string> = {
  tag_no: "Küpe no",
  name: "İsim",
  species: "Tür",
  sex: "Cinsiyet",
  breed_id: "Irk",
  breed_note: "Irk notu",
  birth_date: "Doğum tarihi",
  birth_type: "Doğum tipi",
  mother_id: "Anne",
  father_id: "Baba",
  status: "Durum",
  group_id: "Grup",
  notes: "Not",
  note: "Not",
  current_weight: "Son kilo",
  is_pregnant: "Gebe",
  expected_birth_at: "Beklenen doğum",
  weight_kg: "Kilo",
  weighed_at: "Tartım tarihi",
  product_name: "Ürün",
  dose: "Doz",
  applied_at: "Uygulama tarihi",
  next_due_at: "Sonraki doz",
  withdrawal_days: "Arınma günü",
  withdrawal_until: "Arınma bitişi",
  cost: "Maliyet",
  vet_name: "Veteriner",
  type: "Tür",
  severity: "Şiddet",
  category: "Kategori",
  tags: "Etiketler",
  observed_at: "Gözlem zamanı",
  quantity: "Miktar",
  unit: "Birim",
  unit_price: "Birim fiyat",
  total: "Toplam",
  amount: "Tutar",
  price: "Fiyat",
  buyer: "Alıcı",
  supplier: "Satıcı",
  consumed_on: "Tüketim günü",
  purchased_at: "Alım tarihi",
  spent_at: "Gider tarihi",
  received_at: "Gelir tarihi",
  exited_at: "Çıkış tarihi",
  reason: "Sebep",
  min_stock: "Alt sınır",
  track_stock: "Bakiye tutulsun",
  capacity: "Kapasite",
  active: "Aktif",
  deleted_at: "Silinme",
  delete_reason: "Silme sebebi",
};

/** Kayıt gürültüsü: her yazmada değişir, kullanıcıya bir şey anlatmaz. */
const noisyFields = new Set(["updated_at", "created_at", "sync_seq", "id", "farm_id", "created_by", "deleted_by", "recorded_at", "device_id", "source", "photo_path", "document_path"]);

function show(value: unknown): string {
  if (value == null) return "boş";
  if (typeof value === "boolean") return value ? "evet" : "hayır";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "boş";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoToDisplay(s);
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return formatDateTime(s.replace(" ", "T"));
  const enumLabel =
    labels.animalStatus[s as keyof typeof labels.animalStatus] ??
    labels.severity[s as keyof typeof labels.severity] ??
    labels.observationCategory[s as keyof typeof labels.observationCategory] ??
    labels.healthType[s as keyof typeof labels.healthType] ??
    labels.exitType[s as keyof typeof labels.exitType];
  return enumLabel ?? s;
}

interface Change {
  field: string;
  from: unknown;
  to: unknown;
}

function diff(oldData: unknown, newData: unknown): Change[] {
  const before = (oldData ?? {}) as Record<string, unknown>;
  const after = (newData ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Change[] = [];
  for (const field of keys) {
    if (noisyFields.has(field)) continue;
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    out.push({ field, from, to });
  }
  return out;
}

/** Değişiklik geçmişi: kim, ne zaman, neyi değiştirdi. Sunucudan okur, çevrimiçi gerekir. */
export function AuditPage() {
  const role = useAuthStore((s) => s.user?.role);
  const trpc = useTRPC();
  const [params, setParams] = useSearchParams();
  const recordId = params.get("record") ?? undefined;
  const tableName = params.get("table") ?? undefined;

  const tables = useQuery(trpc.audit.tables.queryOptions());
  const history = useInfiniteQuery(
    trpc.audit.list.infiniteQueryOptions(
      { recordId, tableName, limit: 50 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    ),
  );

  const rows = useMemo(() => (history.data?.pages ?? []).flatMap((p: { rows: unknown[] }) => p.rows), [history.data]);

  if (role && role !== "owner") return <Navigate to="/" replace />;

  function setFilter(key: string, value: string | null) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Değişiklik geçmişi"
        description={recordId ? "Bu kayıtta yapılan değişiklikler" : "Çiftlikte kim, ne zaman, neyi değiştirdi"}
        actions={
          recordId ? (
            <Button variant="outline" onClick={() => setFilter("record", null)}>
              Tüm kayıtlar
            </Button>
          ) : null
        }
      />

      {!recordId ? (
        <div className="mb-4 w-64">
          <Select value={tableName ?? "all"} onValueChange={(v) => setFilter("table", v === "all" ? null : v)}>
            <SelectTrigger data-testid="audit-table-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kayıt türleri</SelectItem>
              {(tables.data ?? []).map((t: { tableName: string; n: number }) => (
                <SelectItem key={t.tableName} value={t.tableName}>
                  {tableLabels[t.tableName] ?? t.tableName} ({t.n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {history.isError ? <p className="text-sm text-danger">Geçmiş alınamadı; bu ekran için bağlantı gerekli.</p> : null}
      {!history.isLoading && rows.length === 0 ? <EmptyState title="Kayıt yok" description="Değişiklikler burada listelenir." /> : null}

      <div className="grid gap-2" data-testid="audit-list">
        {(rows as { id: string; tableName: string; recordId: string; action: string; oldData: unknown; newData: unknown; createdAt: string | Date; userName: string | null }[]).map((r) => {
          const changes = r.action.toUpperCase() === "UPDATE" ? diff(r.oldData, r.newData) : [];
          return (
            <Card key={r.id} className="py-0">
              <CardContent className="grid gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <span className="font-medium">{tableLabels[r.tableName] ?? r.tableName}</span>
                  <Badge variant={r.action.toUpperCase() === "DELETE" ? "destructive" : r.action.toUpperCase() === "INSERT" ? "secondary" : "outline"}>{actionLabel(r.action)}</Badge>
                  <span className="text-muted-foreground">{r.userName ?? "sistem"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(r.createdAt as string)}</span>
                </div>
                {changes.length ? (
                  <ul className="grid gap-0.5 pl-6 text-xs text-muted-foreground">
                    {changes.slice(0, 8).map((c) => (
                      <li key={c.field}>
                        <span className="text-foreground">{fieldLabels[c.field] ?? c.field}:</span> {show(c.from)} → {show(c.to)}
                      </li>
                    ))}
                    {changes.length > 8 ? <li>ve {changes.length - 8} alan daha</li> : null}
                  </ul>
                ) : null}
                {r.tableName === "animals" ? (
                  <Link to={`/animals/${r.recordId}`} className="pl-6 text-xs text-primary hover:underline">
                    Hayvanı aç
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {history.hasNextPage ? (
        <Button variant="outline" className="mt-4" onClick={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage} data-testid="audit-more">
          Daha fazla
        </Button>
      ) : null}
    </>
  );
}
