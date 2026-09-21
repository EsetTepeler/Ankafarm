import { labels, type StockUnit } from "@anka/shared";
import { CopyCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addConsumptions, useLastConsumptionDay, useStockItems } from "@/features/stock/repo";
import { errorMessage } from "@/lib/auth";
import { isoToDisplay, todayIso } from "@/utils/date";

/**
 * Günlük tur: oluğa konan yem ve verilen su tek ekranda. Varsayılan tüm sürü (grup boş).
 * "Dünkü gibi" son girilen günün miktarlarını doldurur; bir dakikada biter (bölüm 5).
 */
export function ConsumptionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const items = useStockItems({ activeOnly: true });
  const last = useLastConsumptionDay();
  const [date, setDate] = useState<string | null>(todayIso());
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(todayIso());
      setValues({});
    }
  }, [open]);

  const rows = (items.data ?? []).filter((i) => i.category === "feed" || i.category === "water" || i.category === "supply");

  function fillFromLast() {
    const byItem = last.data?.byItem;
    if (!byItem) return;
    setValues(Object.fromEntries(Object.entries(byItem).map(([id, qty]) => [id, String(qty).replace(".", ",")])));
  }

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const entries = Object.entries(values)
        .map(([itemId, raw]) => ({ itemId, quantity: raw.trim() ? Number(raw.trim().replace(",", ".")) : 0 }))
        .filter((e) => e.quantity > 0);
      if (entries.length === 0) throw new Error("En az bir kaleme miktar gir");
      const n = await addConsumptions(entries.map((e) => ({ itemId: e.itemId, consumedOn: date, quantity: e.quantity })));
      toast.success(`${n} kalem için tüketim kaydedildi`);
      onOpenChange(false);
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
          <DialogTitle>Günlük tüketim</DialogTitle>
          <DialogDescription>Bugün oluğa konan yem ve verilen su. Boş bıraktığın kalem kaydedilmez.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <DateField id="consumption-date" label="Tarih" value={date} onChange={setDate} testID="consumption-date" required />
          {last.data ? (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={fillFromLast} data-testid="consumption-repeat">
              <CopyCheck /> {isoToDisplay(last.data.day)} gibi
            </Button>
          ) : null}
          <div className="grid gap-2">
            {rows.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <Label htmlFor={`consumption-${item.id}`} className="font-normal">
                  {item.name}
                  <span className="text-muted-foreground"> · {labels.stockUnit[item.unit as StockUnit] ?? item.unit}</span>
                </Label>
                <Input
                  id={`consumption-${item.id}`}
                  inputMode="decimal"
                  value={values[item.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                  data-testid={`consumption-qty-${item.name}`}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="consumption-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
