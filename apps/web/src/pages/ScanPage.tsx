import jsQR from "jsqr";
import { Camera, CameraOff, ScanLine, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseScan, resolveScan } from "@/features/qr/qr";

type BarcodeDetectorLike = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function nativeDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * QR tarama: tarayıcı kamerası. Chrome/Android'de yerleşik BarcodeDetector, diğerlerinde jsQR ile kare kare çözüm.
 * Okunan adres yerel veritabanında aranır, profil açılır; çevrimdışı çalışır. Kamera yoksa elle giriş.
 */
export function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const busyRef = useRef(false);

  async function open(raw: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      const target = parseScan(raw);
      if (!target) {
        toast.error("Bu kod bir hayvan etiketi değil");
        return false;
      }
      const found = await resolveScan(target);
      if (!found) {
        toast.error(target.kind === "tag" ? `${target.tagNo} küpeli hayvan bulunamadı` : "Bu etiketin hayvanı bu çiftlikte yok");
        return false;
      }
      navigate(`/animals/${found.id}`);
      return true;
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = nativeDetector();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("off");
        setCameraError("Bu tarayıcıda kamera erişimi yok");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (err) {
        setCamera("off");
        setCameraError(err instanceof Error && err.name === "NotAllowedError" ? "Kamera izni verilmedi" : "Kamera açılamadı");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setCamera("on");
      let lastTick = 0;
      const tick = async (t: number) => {
        if (stopped) return;
        // Saniyede ~8 kare yeter, pil ve CPU için.
        if (t - lastTick > 120 && video.readyState >= 2) {
          lastTick = t;
          let value: string | null = null;
          if (detector) {
            const codes = await detector.detect(video).catch(() => []);
            value = codes[0]?.rawValue ?? null;
          } else {
            const canvas = canvasRef.current;
            if (canvas) {
              const w = (canvas.width = video.videoWidth);
              const h = (canvas.height = video.videoHeight);
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              if (ctx && w && h) {
                ctx.drawImage(video, 0, 0, w, h);
                value = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
              }
            }
          }
          if (value && (await open(value))) return;
        }
        raf = requestAnimationFrame((n) => void tick(n));
      };
      raf = requestAnimationFrame((n) => void tick(n));
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    void open(manual);
  }

  return (
    <>
      <PageHeader icon={ScanLine} title="QR tara" description="Etiketi kameraya tut; profil kendiliğinden açılır" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_1fr]">
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="size-full object-cover" playsInline muted data-testid="scan-video" />
              <canvas ref={canvasRef} className="hidden" />
              {camera !== "on" ? (
                <div className="absolute inset-0 grid place-items-center text-center text-sm text-white/80">
                  {camera === "starting" ? (
                    <span className="flex items-center gap-2">
                      <Camera className="size-5" /> Kamera açılıyor
                    </span>
                  ) : (
                    <span className="flex items-center gap-2" data-testid="scan-camera-off">
                      <CameraOff className="size-5" /> {cameraError}
                    </span>
                  )}
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-8">
                  {/* Köşe kılavuzları: tam çerçeve yerine dört köşe, kadrajı kapatmadan hedef gösteriyor. */}
                  <span className="absolute left-0 top-0 size-8 rounded-tl-lg border-l-4 border-t-4 border-[var(--brand-amber)]" />
                  <span className="absolute right-0 top-0 size-8 rounded-tr-lg border-r-4 border-t-4 border-[var(--brand-amber)]" />
                  <span className="absolute bottom-0 left-0 size-8 rounded-bl-lg border-b-4 border-l-4 border-[var(--brand-amber)]" />
                  <span className="absolute bottom-0 right-0 size-8 rounded-br-lg border-b-4 border-r-4 border-[var(--brand-amber)]" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="scan-manual">Elle giriş</Label>
                <Input id="scan-manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Küpe numarası veya etiket adresi" autoComplete="off" data-testid="scan-manual" />
                <p className="text-xs text-muted-foreground">Kamera yoksa küpe numarasını yaz ya da etiketteki adresi yapıştır.</p>
              </div>
              <Button type="submit" className="justify-self-start" disabled={!manual.trim()} data-testid="scan-submit">
                <Search /> Aç
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
