import { labels, type ExitType } from "@anka/shared";
import { useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addExit } from "@/features/exits/repo";
import { errorMessage } from "@/lib/auth";
import { todayIso } from "@/utils/date";

const types = Object.entries(labels.exitType) as [ExitType, string][];

/** Çıkış: satış, ölüm, kesim, kayıp. Hayvan arşive düşer; kayıt silinmez, geri alınabilir. */
export function ExitDialog({ open, onOpenChange, animalId, tagNo, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; animalId: string; tagNo: string; onSaved: () => void }) {
  const [type, setType] = useState<ExitType>("sold");
  const [date, setDate] = useState<string | null>(todayIso());
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const p = price.trim().replace(",", ".");
      await addExit({ animalId, type, exitedAt: date, reason: reason.trim() || null, price: type === "sold" && p ? Number(p) : null, buyer: type === "sold" && buyer.trim() ? buyer.trim() : null });
      toast.success(`${tagNo} ${labels.exitType[type].toLocaleLowerCase("tr")} olarak işaretlendi`);
      onOpenChange(false);
      onSaved();
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
          <DialogTitle>Sürüden çıkış · {tagNo}</DialogTitle>
          <DialogDescription>Hayvan arşive geçer, kayıtları kalır. Yanlış girişte çıkış geri alınabilir.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <ToggleGroup type="single" variant="outline" value={type} onValueChange={(v) => v && setType(v as ExitType)}>
            {types.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} data-testid={`exit-type-${value}`}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DateField id="exit-date" label="Tarih" value={date} onChange={setDate} testID="exit-date" required />
          {type === "sold" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="exit-price">Fiyat, TL</Label>
                <Input id="exit-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="exit-price" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="exit-buyer">Alıcı</Label>
                <Input id="exit-buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="exit-reason">{type === "died" ? "Ölüm nedeni" : "Açıklama"}</Label>
            <Input id="exit-reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="exit-reason" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button variant="destructive" onClick={() => void save()} disabled={busy} data-testid="exit-save">
            Çıkışı kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
