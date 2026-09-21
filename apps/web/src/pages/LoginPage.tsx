import { Loader2, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import { BRAND_TAGLINE, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, useAuthStore } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Marka tarafı: geniş ekranda logo ve vaat, dar ekranda gizli. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--brand-amber), transparent 70%)" }}
        />
        {/* justify-between için üst boşluk; marka bloğu ortada, slogan altta dursun. */}
        <span aria-hidden />
        <div className="relative grid gap-4">
          <img src="/logo-mark.png" alt="" className="size-24 rounded-3xl shadow-xl" />
          <Wordmark tone="light" className="text-4xl" />
          <p className="max-w-sm text-lg text-sidebar-foreground/80">{BRAND_TAGLINE}</p>
          <p className="max-w-sm text-sm leading-relaxed text-sidebar-foreground/60">
            Sürünün sağlığı, üremesi, kilosu, yemi ve masrafı tek yerde. Ahırda internet olmasa da çalışır, bağlantı gelince kendiliğinden eşitlenir.
          </p>
        </div>
        <p className="relative text-xs uppercase tracking-[0.3em] text-sidebar-foreground/50">Takip · Bakım · Veri · Gelecek</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <img src="/logo-mark.png" alt="" className="size-16 rounded-2xl shadow-sm" />
            <Wordmark className="text-2xl" />
            <p className="text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-5 grid gap-1">
                <h1 className="text-xl font-semibold">Çiftlik paneline giriş</h1>
                <p className="text-sm text-muted-foreground">Hesabın yoksa çiftlik sahibi açar.</p>
              </div>
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">E-posta</Label>
                  <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Şifre</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="login-password"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" disabled={busy} data-testid="login-submit" size="lg">
                  {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
                  {busy ? "Giriş yapılıyor" : "Giriş yap"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">Kayıtlar cihazda da saklanır; şifreni kimseyle paylaşma.</p>
        </div>
      </div>
    </div>
  );
}
