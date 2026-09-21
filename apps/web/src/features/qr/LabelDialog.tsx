import { Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { labelLayouts, printLabelSheet, type LabelAnimal, type LabelSize } from "@/features/qr/labels";
import { useFarmName } from "@/lib/farm";

const sizes = Object.entries(labelLayouts) as [LabelSize, (typeof labelLayouts)[LabelSize]][];

/** Seçili hayvanlar için QR etiket sayfası; yazdırma penceresinden PDF olarak da kaydedilebilir. */
export function LabelDialog({ open, onOpenChange, animals }: { open: boolean; onOpenChange: (o: boolean) => void; animals: LabelAnimal[] }) {
  const farmName = useFarmName();
  const [size, setSize] = useState<LabelSize>("medium");
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    try {
      const ok = await printLabelSheet(animals, size, farmName);
      if (!ok) toast.error("Açılır pencere engellendi; tarayıcıdan izin ver");
      else onOpenChange(false);
    } catch {
      toast.error("Etiketler oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Etiket yazdır · {animals.length} hayvan</DialogTitle>
          <DialogDescription>Her etikette hayvanın QR'ı, küpe numarası ve ismi olur. Okutunca profili açar, çevrimdışı da çalışır.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ToggleGroup type="single" variant="outline" value={size} onValueChange={(v) => v && setSize(v as LabelSize)} className="justify-start">
            {sizes.map(([value, layout]) => (
              <ToggleGroupItem key={value} value={value} data-testid={`label-size-${value}`}>
                {layout.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{labelLayouts[size].hint} · A4 sayfada {labelLayouts[size].columns * 4} etikete kadar</p>
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Resmi küpelerde QR yok. Bu etiketleri dayanıklı malzemeye bastır: lamine kağıt ya da dış mekan etiketi; küpenin yanına ikinci etiket olarak veya padok kartı olarak kullan.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void print()} disabled={busy || animals.length === 0} data-testid="label-print">
            <Printer /> Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
