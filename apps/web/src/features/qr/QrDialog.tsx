import { Copy, Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { animalUrl } from "@/features/qr/qr";

/** Hayvanın QR kodu: profil adresi. Ekranda gösterilir, tek etiket yazdırılır; toplu PDF basımı 3.5'te. */
export function QrDialog({ open, onOpenChange, animalId, tagNo, name }: { open: boolean; onOpenChange: (o: boolean) => void; animalId: string; tagNo: string; name?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  function print() {
    const png = canvasRef.current?.toDataURL("image/png");
    if (!png) return;
    const w = window.open("", "_blank", "width=420,height=520");
    if (!w) {
      toast.error("Açılır pencere engellendi");
      return;
    }
    w.document.write(
      `<!doctype html><title>${tagNo}</title><body style="margin:0;display:grid;place-items:center;height:100vh;font-family:system-ui;text-align:center">` +
        `<div><img src="${png}" width="224" height="224"><div style="font-size:28px;font-weight:700;margin-top:8px">${tagNo}</div>` +
        `${name ? `<div style="font-size:16px;color:#555">${name}</div>` : ""}</div>` +
        `<script>window.onload=function(){window.print();window.close()}</script></body>`,
    );
    w.document.close();
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
          <Button onClick={print} data-testid="qr-print">
            <Printer /> Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
