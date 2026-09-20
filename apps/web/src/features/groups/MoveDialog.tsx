import { labels, type GroupKind } from "@anka/shared";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { EntityPicker } from "@/components/EntityPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveAnimals, useGroupCounts, useGroups } from "@/features/groups/repo";
import { errorMessage } from "@/lib/auth";
import { todayIso } from "@/utils/date";

/** Tek hayvan (profil) veya seçili hayvanlar (liste) için grup değişikliği. */
export function MoveDialog({
  open,
  onOpenChange,
  animalIds,
  currentGroupId,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  animalIds: string[];
  /** Tek hayvan taşınırken mevcut grup listeden çıkarılır. */
  currentGroupId?: string | null;
  onMoved?: (count: number) => void;
}) {
  const groups = useGroups();
  const counts = useGroupCounts();
  const [toGroupId, setToGroupId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () =>
      (groups.data ?? [])
        .filter((g) => animalIds.length !== 1 || g.id !== currentGroupId)
        .map((g) => {
          const n = counts.data?.get(g.id) ?? 0;
          return { id: g.id, label: g.name, description: `${labels.groupKind[g.kind as GroupKind] ?? g.kind} · ${n}${g.capacity ? ` / ${g.capacity}` : ""}` };
        }),
    [groups.data, counts.data, animalIds.length, currentGroupId],
  );

  async function save() {
    setBusy(true);
    try {
      if (!toGroupId) throw new Error("Hedef grup seç");
      if (!date) throw new Error("Tarih gerekli");
      const n = await moveAnimals({ animalIds, toGroupId, movedAt: new Date(`${date}T12:00:00`).toISOString(), reason: reason.trim() || null });
      const name = groups.data?.find((g) => g.id === toGroupId)?.name ?? "gruba";
      toast.success(n === 0 ? "Seçilenler zaten bu grupta" : `${n} hayvan ${name} grubuna taşındı`);
      onOpenChange(false);
      setToGroupId(null);
      setReason("");
      onMoved?.(n);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{animalIds.length === 1 ? "Grup değiştir" : `${animalIds.length} hayvanı taşı`}</DialogTitle>
          <DialogDescription>Hareket zaman çizelgesine yazılır; hayvanın grubu son harekete göre belirlenir.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <EntityPicker label="Hedef grup" items={items} value={toGroupId} onChange={setToGroupId} placeholder="Grup seç" testID="move-group" />
          <DateField id="move-date" label="Tarih" value={date} onChange={setDate} testID="move-date" required />
          <div className="grid gap-1.5">
            <Label htmlFor="move-reason">Neden</Label>
            <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Doğuma hazırlık, karantina, mera" data-testid="move-reason" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy || !toGroupId} data-testid="move-save">
            Taşı
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
