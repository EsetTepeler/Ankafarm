import { formatKg, labels, type HealthType, type Species } from "@anka/shared";
import { ArrowLeftRight, Scale, Syringe, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { DateField } from "@/components/DateField";
import { EntityPicker } from "@/components/EntityPicker";
import { HealthForm } from "@/components/HealthForm";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnimals, type AnimalListItem } from "@/features/animals/repo";
import { MoveDialog } from "@/features/groups/MoveDialog";
import { useGroups } from "@/features/groups/repo";
import { addHealthBulk, emptyHealthForm, undoHealthBatch, type HealthFormValues } from "@/features/health/repo";
import { addWeights } from "@/features/weights/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { todayIso } from "@/utils/date";

/**
 * Toplu işlem (madde 1.8 ve 3.1): aynı ekrandan sağlık kaydı, tartım ve grup taşıma.
 * Kırkım da sağlık sekmesinden girilir (`shearing` türü).
 */
export function BulkPage() {
  const [groupId, setGroupId] = useState<string | undefined>();
  const animals = useAnimals({ status: "active", groupId });
  const groups = useGroups();
  const rows = animals.data ?? [];
  const groupItems = useMemo(() => (groups.data ?? []).map((g) => ({ id: g.id, label: g.name })), [groups.data]);

  const picker = (
    <div className="max-w-sm">
      <EntityPicker label="Grup" items={groupItems} value={groupId ?? null} onChange={(v) => setGroupId(v ?? undefined)} noneLabel="Tüm gruplar" placeholder="Tüm gruplar" testID="bulk-group" />
    </div>
  );

  return (
    <>
      <PageHeader title="Toplu işlem" description="Tüm sürüye veya seçili hayvanlara tek seferde kayıt" />
      <Tabs defaultValue="health">
        <TabsList className="mb-4">
          <TabsTrigger value="health" data-testid="tab-bulk-health">
            Sağlık
          </TabsTrigger>
          <TabsTrigger value="weight" data-testid="tab-bulk-weight">
            Tartım
          </TabsTrigger>
          <TabsTrigger value="move" data-testid="tab-bulk-move">
            Grup taşıma
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <HealthTab rows={rows} loading={animals.isLoading} picker={picker} />
        </TabsContent>
        <TabsContent value="weight">
          <WeightTab rows={rows} loading={animals.isLoading} picker={picker} />
        </TabsContent>
        <TabsContent value="move">
          <MoveTab rows={rows} loading={animals.isLoading} picker={picker} />
        </TabsContent>
      </Tabs>
    </>
  );
}

interface TabProps {
  rows: AnimalListItem[];
  loading: boolean;
  picker: React.ReactNode;
}

function HealthTab({ rows, loading, picker }: TabProps) {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<HealthFormValues>(emptyHealthForm);
  const [busy, setBusy] = useState(false);

  const selected = rows.filter((a) => !excluded.has(a.id));
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
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>
            Kayıt bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HealthForm values={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>
            Kime?{" "}
            <span className="font-normal text-muted-foreground" data-testid="bulk-count">
              {selected.length} / {rows.length} hayvan seçili
            </span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExcluded(allSelected ? new Set(rows.map((a) => a.id)) : new Set())} data-testid="bulk-toggle-all">
            {allSelected ? "Hiçbirini seçme" : "Tümünü seç"}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {picker}
          {rows.length === 0 ? (
            <EmptyState title={loading ? "Yükleniyor" : "Bu seçimde aktif hayvan yok"} />
          ) : (
            <div className="max-h-[420px] overflow-auto border">
              <Table>
                <TableHeader className="sticky top-0 z-[1] bg-card">
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
  );
}

/** Tartım günü: sırayla her hayvanın kilosu girilir, Enter bir alt satıra geçer. */
function WeightTab({ rows, loading, picker }: TabProps) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string | null>(todayIso());
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const filled = rows.filter((a) => (values[a.id] ?? "").trim() !== "");

  function parse(raw: string): number | null {
    const n = Number(raw.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const entries = filled.map((a) => ({ animalId: a.id, weightKg: parse(values[a.id]!) })).filter((e): e is { animalId: string; weightKg: number } => e.weightKg != null);
      if (entries.length === 0) throw new Error("En az bir hayvana kilo gir");
      const n = await addWeights(entries, new Date(`${date}T12:00:00`).toISOString());
      toast.success(`${n} hayvanın tartımı kaydedildi`);
      navigate("/animals");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Tartım{" "}
          <span className="font-normal text-muted-foreground" data-testid="weigh-count">
            {filled.length} / {rows.length} girildi
          </span>
        </CardTitle>
        <Button onClick={() => void save()} disabled={busy || filled.length === 0} data-testid="weigh-save">
          <Scale /> Tartımları kaydet
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {picker}
          <DateField id="weigh-date" label="Tarih" value={date} onChange={setDate} testID="weigh-date" required />
        </div>
        {rows.length === 0 ? (
          <EmptyState title={loading ? "Yükleniyor" : "Bu seçimde aktif hayvan yok"} />
        ) : (
          <div className="max-h-[520px] overflow-auto border">
            <Table>
              <TableHeader className="sticky top-0 z-[1] bg-card">
                <TableRow>
                  <TableHead>Küpe</TableHead>
                  <TableHead>İsim</TableHead>
                  <TableHead className="text-right">Son kilo</TableHead>
                  <TableHead className="w-32 text-right">Yeni kilo</TableHead>
                  <TableHead className="w-20 text-right">Fark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a, i) => {
                  const value = values[a.id] ?? "";
                  const kg = parse(value);
                  const delta = kg != null && a.currentWeight != null ? Math.round((kg - a.currentWeight) * 10) / 10 : null;
                  return (
                    <TableRow key={a.id} data-testid={`weigh-row-${a.tagNo}`}>
                      <TableCell className="font-medium">{a.tagNo}</TableCell>
                      <TableCell>{a.name ?? "–"}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{a.currentWeight != null ? formatKg(a.currentWeight) : "–"}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          inputMode="decimal"
                          className="text-right"
                          value={value}
                          onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const next = rows[i + 1];
                            if (next) document.querySelector<HTMLInputElement>(`[data-testid="weigh-input-${next.tagNo}"]`)?.focus();
                          }}
                          aria-label={`${a.tagNo} kilo`}
                          data-testid={`weigh-input-${a.tagNo}`}
                        />
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", delta != null && delta > 0 && "text-success", delta != null && delta < 0 && "text-danger")}>
                        {delta == null ? "–" : `${delta > 0 ? "+" : ""}${String(delta).replace(".", ",")}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Grup taşıma: seçilenler tek harekette yeni gruba geçer (hayvan listesinden de yapılabilir). */
function MoveTab({ rows, loading, picker }: TabProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Taşınacaklar{" "}
          <span className="font-normal text-muted-foreground" data-testid="move-count">
            {selected.size} seçili
          </span>
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((a) => a.id)))} data-testid="move-toggle-all">
            {selected.size === rows.length && rows.length > 0 ? "Hiçbirini seçme" : "Tümünü seç"}
          </Button>
          <Button onClick={() => setOpen(true)} disabled={selected.size === 0} data-testid="move-open">
            <ArrowLeftRight /> Gruba taşı
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {picker}
        {rows.length === 0 ? (
          <EmptyState title={loading ? "Yükleniyor" : "Bu seçimde aktif hayvan yok"} />
        ) : (
          <div className="max-h-[520px] overflow-auto border">
            <Table>
              <TableHeader className="sticky top-0 z-[1] bg-card">
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Küpe</TableHead>
                  <TableHead>İsim</TableHead>
                  <TableHead>Şu anki grup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => toggle(a.id)} data-testid={`move-row-${a.tagNo}`}>
                    <TableCell>
                      <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={a.tagNo} />
                    </TableCell>
                    <TableCell className="font-medium">{a.tagNo}</TableCell>
                    <TableCell>{a.name ?? "–"}</TableCell>
                    <TableCell>{a.groupName ?? "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <MoveDialog open={open} onOpenChange={setOpen} animalIds={[...selected]} onMoved={() => setSelected(new Set())} />
    </Card>
  );
}
