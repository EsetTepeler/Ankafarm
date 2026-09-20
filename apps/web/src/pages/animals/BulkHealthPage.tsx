import { labels, type HealthType, type Species } from "@anka/shared";
import { Syringe } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { HealthForm } from "@/components/HealthForm";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntityPicker } from "@/components/EntityPicker";
import { useAnimals } from "@/features/animals/repo";
import { useGroups } from "@/features/groups/repo";
import { addHealthBulk, emptyHealthForm, undoHealthBatch, type HealthFormValues } from "@/features/health/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";

/**
 * Toplu sağlık girişi: varsayılan seçim tüm aktif hayvanlar; grupla daraltılır, tek tek değiştirilir.
 * Kayıtlar ortak batch_id ile yazılır; "Geri al" hepsini soft delete eder.
 */
export function BulkHealthPage() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [groupId, setGroupId] = useState<string | undefined>();
  const animals = useAnimals({ status: "active", groupId });
  const groups = useGroups();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<HealthFormValues>(emptyHealthForm);
  const [busy, setBusy] = useState(false);

  const rows = animals.data ?? [];
  const selected = useMemo(() => rows.filter((a) => !excluded.has(a.id)), [rows, excluded]);
  const allSelected = excluded.size === 0;
  const typeLabel = labels.healthType[form.type as HealthType].toLocaleLowerCase("tr");

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      const result = await addHealthBulk(
        selected.map((a) => a.id),
        form,
      );
      toast.success(`${result.count} hayvana ${typeLabel} kaydı eklendi`, {
        duration: 8000,
        action:
          role === "owner"
            ? {
                label: "Geri al",
                onClick: () => {
                  void undoHealthBatch(result.batchId).then((n) => toast.info(`${n} kayıt geri alındı`));
                },
              }
            : undefined,
      });
      navigate("/animals");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Toplu sağlık girişi" description="Tüm sürüye veya seçili hayvanlara aynı kayıt, tek seferde" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ne uygulandı?</CardTitle>
          </CardHeader>
          <CardContent>
            <HealthForm values={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Kime? <span className="font-normal text-muted-foreground" data-testid="bulk-count">{selected.length} / {rows.length} hayvan seçili</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setExcluded(allSelected ? new Set(rows.map((a) => a.id)) : new Set())} data-testid="bulk-toggle-all">
              {allSelected ? "Hiçbirini seçme" : "Tümünü seç"}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="max-w-sm">
              <EntityPicker
                label="Grup"
                items={(groups.data ?? []).map((g) => ({ id: g.id, label: g.name }))}
                value={groupId ?? null}
                onChange={(v) => {
                  setGroupId(v ?? undefined);
                  setExcluded(new Set());
                }}
                noneLabel="Tüm gruplar"
                placeholder="Tüm gruplar"
                testID="bulk-group"
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState title={animals.isLoading ? "Yükleniyor" : "Bu seçimde aktif hayvan yok"} />
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Küpe</TableHead>
                      <TableHead>İsim</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead>Grup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => toggle(a.id)} data-testid={`bulk-row-${a.tagNo}`}>
                        <TableCell>
                          <Checkbox checked={!excluded.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={a.tagNo} />
                        </TableCell>
                        <TableCell className="font-medium">{a.tagNo}</TableCell>
                        <TableCell>{a.name ?? "–"}</TableCell>
                        <TableCell>{labels.species[a.species as Species]}</TableCell>
                        <TableCell>{a.groupName ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Button onClick={() => void save()} disabled={busy || selected.length === 0} data-testid="bulk-save" className="justify-self-end">
              <Syringe /> {selected.length} hayvana {typeLabel} kaydı ekle
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
