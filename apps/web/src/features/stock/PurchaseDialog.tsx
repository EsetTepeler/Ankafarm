import { formatMoney, labels, resolvePurchaseAmounts, type StockUnit } from "@anka/shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { EntityPicker } from "@/components/EntityPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addPurchase, useStockItems } from "@/features/stock/repo";
import { errorMessage } from "@/lib/auth";
import { todayIso } from "@/utils/date";

const num = (s: string) => (s.trim() ? Number(s.trim().replace(",", ".")) : null);

/** Alım: stoğa giriş ve gider. Birim fiyat ile toplamdan biri girilince diğeri hesaplanır. */
export function PurchaseDialog({ open, onOpenChange, itemId }: { open: boolean; onOpenChange: (o: boolean) => void; itemId?: string }) {
  const items = useStockItems({ activeOnly: true });
  const [selected, setSelected] = useState<string | null>(itemId ?? null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [total, setTotal] = useState("");
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected(itemId ?? null);
  }, [open, itemId]);

  const pickerItems = useMemo(
    () => (items.data ?? []).map((i) => ({ id: i.id, label: i.name, description: labels.stockUnit[i.unit as StockUnit] ?? i.unit })),
    [items.data],
  );
  const unit = items.data?.find((i) => i.id === selected)?.unit;
  const preview = useMemo(() => {
    const q = num(quantity);
    if (!q) return null;
    return resolvePurchaseAmounts({ quantity: q, unitPrice: num(unitPrice), total: num(total) });
  }, [quantity, unitPrice, total]);

  async function save() {
    setBusy(true);
    try {
      if (!selected) throw new Error("Kalem seç");
      if (!date) throw new Error("Tarih gerekli");
      const q = num(quantity);
      if (!q) throw new Error("Miktar gerekli");
      await addPurchase({ itemId: selected, purchasedAt: date, quantity: q, unitPrice: num(unitPrice), total: num(total), supplier: supplier.trim() || null });
      toast.success("Alım kaydedildi");
      setQuantity("");
      setUnitPrice("");
      setTotal("");
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
          <DialogTitle>Alım ekle</DialogTitle>
          <DialogDescription>Stoğa giriş yapar ve ayın giderine yazılır.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <EntityPicker label="Kalem" items={pickerItems} value={selected} onChange={setSelected} placeholder="Kalem seç" testID="purchase-item" />
          <DateField id="purchase-date" label="Tarih" value={date} onChange={setDate} testID="purchase-date" required />
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="purchase-qty">Miktar{unit ? `, ${labels.stockUnit[unit as StockUnit] ?? unit}` : ""}</Label>
              <Input id="purchase-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="purchase-qty" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="purchase-price">Birim fiyat</Label>
              <Input id="purchase-price" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} data-testid="purchase-price" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="purchase-total">Toplam</Label>
              <Input id="purchase-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} data-testid="purchase-total" />
            </div>
          </div>
          {preview?.total != null ? (
            <p className="text-sm text-muted-foreground" data-testid="purchase-preview">
              Toplam {formatMoney(preview.total)}
              {preview.unitPrice != null ? ` · birim ${formatMoney(preview.unitPrice)}` : ""}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="purchase-supplier">Satıcı</Label>
            <Input id="purchase-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} data-testid="purchase-supplier" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="purchase-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
