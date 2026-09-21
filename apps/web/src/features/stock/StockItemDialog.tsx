import { labels, type StockCategory, type StockUnit } from "@anka/shared";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createStockItem, updateStockItem, type StockLevel } from "@/features/stock/repo";
import { errorMessage } from "@/lib/auth";

const categories = Object.entries(labels.stockCategory) as [StockCategory, string][];
const units = Object.entries(labels.stockUnit) as [StockUnit, string][];

export function StockItemDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: StockLevel | null }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StockCategory>("feed");
  const [unit, setUnit] = useState<StockUnit>("kg");
  const [minStock, setMinStock] = useState("");
  const [trackStock, setTrackStock] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCategory((item?.category as StockCategory) ?? "feed");
    setUnit((item?.unit as StockUnit) ?? "kg");
    setMinStock(item?.minStock?.toString() ?? "");
    setTrackStock(item?.trackStock ?? true);
  }, [open, item]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const min = minStock.trim() ? Number(minStock.replace(",", ".")) : null;
      const fields = { name: name.trim(), category, unit, minStock: min, trackStock };
      if (item) await updateStockItem(item.id, fields);
      else await createStockItem(fields);
      toast.success(item ? "Kalem güncellendi" : `${fields.name} eklendi`);
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
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{item ? "Kalemi düzenle" : "Yeni stok kalemi"}</DialogTitle>
            <DialogDescription>Yem, su, ilaç ve malzeme kalemleri. Alım ve tüketim bu kalemlere yazılır.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="item-name">Ad</Label>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="item-name" />
          </div>
          <ToggleGroup type="single" variant="outline" value={category} onValueChange={(v) => v && setCategory(v as StockCategory)} className="flex-wrap justify-start">
            {categories.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} data-testid={`item-cat-${value}`}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="item-unit">Birim</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as StockUnit)}>
                <SelectTrigger id="item-unit" data-testid="item-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-min">Alt sınır</Label>
              <Input id="item-min" inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="uyarı seviyesi" data-testid="item-min" disabled={!trackStock} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span>
              Stok bakiyesi tut
              <span className="block text-xs text-muted-foreground">Kapalıyken sadece tüketim sayılır (yağmur suyu gibi).</span>
            </span>
            <Switch checked={trackStock} onCheckedChange={setTrackStock} data-testid="item-track" />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy || !name.trim()} data-testid="item-save">
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
