import { formatKg, labels, type GroupKind, type Sex, type Species } from "@anka/shared";
import { ArrowLeftRight, CloudUpload, Plus, Printer, Search, Syringe, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { EntityPicker } from "@/components/EntityPicker";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnimals } from "@/features/animals/repo";
import { MoveDialog } from "@/features/groups/MoveDialog";
import { LabelDialog } from "@/features/qr/LabelDialog";
import { useGroups } from "@/features/groups/repo";
import { formatAge } from "@/utils/date";

export function AnimalsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const groupId = params.get("group") ?? undefined;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [species, setSpecies] = useState<Species | undefined>();
  const [sex, setSex] = useState<Sex | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const list = useAnimals({ search, status, species, sex, groupId });
  const groups = useGroups();
  const rows = list.data ?? [];

  const groupItems = useMemo(
    () => (groups.data ?? []).map((g) => ({ id: g.id, label: g.name, description: labels.groupKind[g.kind as GroupKind] ?? g.kind })),
    [groups.data],
  );
  const selectedVisible = rows.filter((a) => selected.has(a.id));
  const allVisibleSelected = rows.length > 0 && selectedVisible.length === rows.length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setGroup(id: string | null) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id) next.set("group", id);
      else next.delete("group");
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Hayvanlar"
        description={list.isLoading ? "Yükleniyor" : `${rows.length} hayvan`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/animals/bulk" data-testid="bulk-health">
                <Syringe /> Toplu işlem
              </Link>
            </Button>
            <Button asChild>
              <Link to="/animals/new" data-testid="animal-add">
                <Plus /> Hayvan ekle
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card p-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Küpe no veya isim" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="animal-search" />
        </div>
        <div className="w-56 [&>div>label]:sr-only">
          <EntityPicker label="Grup" items={groupItems} value={groupId ?? null} onChange={setGroup} placeholder="Tüm gruplar" noneLabel="Tüm gruplar" testID="animal-group-filter" />
        </div>
        <ToggleGroup type="single" variant="outline" value={species ?? ""} onValueChange={(v) => setSpecies((v || undefined) as Species | undefined)}>
          <ToggleGroupItem value="sheep">Koyun</ToggleGroupItem>
          <ToggleGroupItem value="goat">Keçi</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" value={sex ?? ""} onValueChange={(v) => setSex((v || undefined) as Sex | undefined)}>
          <ToggleGroupItem value="female">Dişi</ToggleGroupItem>
          <ToggleGroupItem value="male">Erkek</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" value={status} onValueChange={(v) => v && setStatus(v as "active" | "archived")} className="sm:ml-auto">
          <ToggleGroupItem value="active">Aktif</ToggleGroupItem>
          <ToggleGroupItem value="archived" data-testid="filter-archived">
            Arşiv
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {selectedVisible.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm" data-testid="selection-bar">
          <span className="font-medium text-primary">{selectedVisible.length} seçili</span>
          <Button size="sm" variant="outline" onClick={() => setMoveOpen(true)} data-testid="bulk-move">
            <ArrowLeftRight /> Gruba taşı
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLabelOpen(true)} data-testid="bulk-labels">
            <Printer /> Etiket yazdır
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">
            <X /> Seçimi bırak
          </Button>
        </div>
      ) : null}

      {!list.isLoading && rows.length === 0 ? (
        <EmptyState
          title={search || species || sex || groupId ? "Eşleşen hayvan yok" : status === "archived" ? "Arşivde hayvan yok" : "Henüz hayvan yok"}
          action={
            <Button asChild size="sm">
              <Link to="/animals/new">İlk hayvanı ekle</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={(v) => setSelected(v ? new Set(rows.map((a) => a.id)) : new Set())} aria-label="Tümünü seç" data-testid="select-all" />
                </TableHead>
                <TableHead>Küpe</TableHead>
                <TableHead>İsim</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Cinsiyet</TableHead>
                <TableHead>Irk</TableHead>
                <TableHead>Grup</TableHead>
                <TableHead>Yaş</TableHead>
                <TableHead className="text-right">Son kilo</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className={selected.has(a.id) ? "cursor-pointer bg-primary/5" : "cursor-pointer"} onClick={() => navigate(`/animals/${a.id}`)} data-testid={`animal-row-${a.tagNo}`}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(a.id)} onCheckedChange={(v) => toggle(a.id, v === true)} aria-label={`${a.tagNo} seç`} data-testid={`select-${a.tagNo}`} />
                  </TableCell>
                  <TableCell className="font-mono text-[13px] font-medium">{a.tagNo}</TableCell>
                  <TableCell>{a.name ?? <span className="text-muted-foreground">–</span>}</TableCell>
                  <TableCell>{labels.species[a.species as Species]}</TableCell>
                  <TableCell>{labels.sex[a.sex as Sex]}</TableCell>
                  <TableCell>{a.breedName ?? "–"}</TableCell>
                  <TableCell data-testid={`group-cell-${a.tagNo}`}>{a.groupName ?? "–"}</TableCell>
                  <TableCell>{formatAge(a.birthDate) || "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.currentWeight != null ? formatKg(a.currentWeight) : "–"}</TableCell>
                  <TableCell>
                    {a.isPregnant ? <Badge variant="secondary">Gebe</Badge> : a.syncSeq === 0 ? <CloudUpload className="size-4 text-muted-foreground" aria-label="Senkron bekliyor" /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MoveDialog open={moveOpen} onOpenChange={setMoveOpen} animalIds={selectedVisible.map((a) => a.id)} onMoved={() => setSelected(new Set())} />
      <LabelDialog open={labelOpen} onOpenChange={setLabelOpen} animals={selectedVisible.map((a) => ({ id: a.id, tagNo: a.tagNo, name: a.name }))} />
    </>
  );
}
