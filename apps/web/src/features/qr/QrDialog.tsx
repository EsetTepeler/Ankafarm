import { Copy, Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { printLabelSheet } from "@/features/qr/labels";
import { animalUrl } from "@/features/qr/qr";
import { useFarmName } from "@/lib/farm";

/** Hayvanın QR kodu: profil adresi. Ekranda gösterilir, tek etiket yazdırılır; toplu basım hayvan listesinden. */
export function QrDialog({ open, onOpenChange, animalId, tagNo, name }: { open: boolean; onOpenChange: (o: boolean) => void; animalId: string; tagNo: string; name?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const farmName = useFarmName();
  const url = animalUrl(animalId);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, url, { width: 224, margin: 1, errorCorrectionLevel: "M" });
  }, [open, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Bağlantı kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  async function print() {
    const ok = await printLabelSheet([{ id: animalId, tagNo, name }], "large", farmName);
    if (!ok) toast.error("Açılır pencere engellendi");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR etiketi · {tagNo}</DialogTitle>
          <DialogDescription>Telefon kamerasıyla okutulunca bu hayvanın profili açılır. Uygulama içi tarayıcı çevrimdışı da çalışır.</DialogDescription>
        </DialogHeader>
        <div className="grid justify-items-center gap-2">
          <canvas ref={canvasRef} className="rounded-lg bg-white p-2" data-testid="qr-canvas" />
          <div className="text-2xl font-semibold">{tagNo}</div>
          {name ? <div className="text-sm text-muted-foreground">{name}</div> : null}
          <code className="break-all text-xs text-muted-foreground" data-testid="qr-url">
            {url}
          </code>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            <Copy /> Bağlantıyı kopyala
          </Button>
          <Button onClick={() => void print()} data-testid="qr-print">
            <Printer /> Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
