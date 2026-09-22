import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminClient } from "@/lib/adminAuth";
import { errorMessage } from "@/lib/auth";

/**
 * Yönetici hesabında iki adımlı doğrulama. Hesap tüm kiracıları açtığı için tek şifre yeterli
 * koruma değil; kurulum QR ile yapılır, kurtarma kodları bir kez gösterilir.
 */
export function TwoFactorCard() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: () => adminClient().platform.me.query(), retry: false });
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "me"] });

  useEffect(() => {
    if (!setup) {
      setQr(null);
      return;
    }
    // QR yerelde üretilir; gizli anahtar hiçbir dış servise gitmez.
    void QRCode.toDataURL(setup.uri, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [setup]);

  const start = useMutation({
    mutationFn: () => adminClient().platform.totpSetup.mutate(),
    onSuccess: (r) => {
      setSetup(r);
      setCode("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const enable = useMutation({
    mutationFn: (c: string) => adminClient().platform.totpEnable.mutate({ code: c }),
    onSuccess: (r) => {
      void refresh();
      setSetup(null);
      setRecoveryCodes(r.recoveryCodes);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const disable = useMutation({
    mutationFn: (password: string) => adminClient().platform.totpDisable.mutate({ password }),
    onSuccess: () => {
      void refresh();
      setDisablePassword(null);
      toast.success("İki adımlı doğrulama kapatıldı");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const enabled = me.data?.totpEnabled ?? false;
  const left = me.data?.recoveryCodesLeft ?? 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            İki adımlı doğrulama
            <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "açık" : "kapalı"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {enabled ? (
            <>
              <p className="text-muted-foreground">
                Girişte şifreden sonra kimlik doğrulayıcı kodu isteniyor. Kalan kurtarma kodu: <strong className="text-foreground">{left}</strong>
                {left <= 2 ? <span className="text-warning"> · azaldı, yenilerini üret</span> : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setDisablePassword("")} data-testid="totp-disable">
                  <ShieldOff /> Kapat
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Bu hesap bütün çiftlikleri görüyor; şifresi ele geçerse tek başına yeterli olmasın. Google Authenticator, 1Password ya da benzeri bir uygulama
                yeterli.
              </p>
              <Button size="sm" className="justify-self-start" onClick={() => start.mutate()} disabled={start.isPending} data-testid="totp-start">
                <ShieldCheck /> Kurulumu başlat
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={setup != null} onOpenChange={(o) => !o && setSetup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kimlik doğrulayıcıyı bağla</DialogTitle>
            <DialogDescription>Karekodu uygulamana okut, sonra gösterdiği altı haneli kodu gir.</DialogDescription>
          </DialogHeader>
          <div className="grid justify-items-center gap-4">
            {qr ? <img src={qr} alt="Kurulum karekodu" className="rounded-xs bg-white p-2" /> : null}
            <button
              type="button"
              className="label-micro text-muted-foreground hover:text-primary"
              title="Anahtarı kopyala"
              onClick={() => void navigator.clipboard.writeText(setup?.secret ?? "").then(() => toast.success("Anahtar kopyalandı"))}
            >
              {setup?.secret} <Copy className="inline size-3" />
            </button>
            <p className="text-xs text-muted-foreground">Karekod okunmuyorsa bu anahtarı elle gir.</p>
            <div className="grid w-full gap-1.5">
              <Label htmlFor="totp-code">Doğrulama kodu</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-lg tracking-[0.3em]"
                data-testid="totp-code"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Vazgeç
            </Button>
            <Button onClick={() => enable.mutate(code.trim())} disabled={enable.isPending || code.trim().length < 6} data-testid="totp-confirm">
              <ShieldCheck /> Aç
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kodlar yalnızca burada bir kez görünür; sunucuda sadece özetleri duruyor. */}
      <Dialog open={recoveryCodes != null} onOpenChange={(o) => !o && setRecoveryCodes(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kurtarma kodlarını kaydet</DialogTitle>
            <DialogDescription>Telefonunu kaybedersen giriş yapmanın tek yolu bunlar. Her kod bir kez çalışır ve bir daha gösterilmez.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 border p-3 font-mono text-sm" data-testid="recovery-codes">
            {(recoveryCodes ?? []).map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void navigator.clipboard.writeText((recoveryCodes ?? []).join("\\n")).then(() => toast.success("Kodlar kopyalandı"))}
            >
              <Copy /> Kopyala
            </Button>
            <Button onClick={() => setRecoveryCodes(null)} data-testid="recovery-done">
              <KeyRound /> Kaydettim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disablePassword != null} onOpenChange={(o) => !o && setDisablePassword(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>İki adımlı doğrulamayı kapat</DialogTitle>
            <DialogDescription>Şifreni iste: çalınan bir oturum bunu tek başına kaldıramasın.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="totp-off-password">Şifre</Label>
            <Input
              id="totp-off-password"
              type="password"
              value={disablePassword ?? ""}
              onChange={(e) => setDisablePassword(e.target.value)}
              data-testid="totp-disable-password"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisablePassword(null)}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              onClick={() => disable.mutate(disablePassword ?? "")}
              disabled={disable.isPending || (disablePassword ?? "").length < 8}
              data-testid="totp-disable-confirm"
            >
              <ShieldOff /> Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
