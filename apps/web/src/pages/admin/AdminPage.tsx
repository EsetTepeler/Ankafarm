import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Loader2, LogIn, LogOut, Play, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { BRAND_TAGLINE, Wordmark } from "@/components/Logo";
import { EmptyState, PageHeader, StatGrid, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/auth";
import { adminClient, useAdminAuthStore } from "@/lib/adminAuth";
import { formatDateTime } from "@/utils/date";

/** Okunabilir ama tahmin edilemez şifre; ilk sahibe elden verilir. */
function suggestPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => alphabet[n % alphabet.length] ?? "x").join("");
}

const emptyDraft = { name: "", location: "", ownerFullName: "", ownerEmail: "", ownerPassword: "" };

/**
 * Süper admin konsolu (`/admin`). Çiftlik uygulamasından ayrı bir oturum kullanır ve yerel
 * veritabanına hiç dokunmaz: kiracıları açar, askıya alır ve sayar, hayvan kaydına karışmaz.
 */
export function AdminPage() {
  const status = useAdminAuthStore((s) => s.status);
  const restore = useAdminAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Oturum kontrol ediliyor
      </div>
    );
  }
  return status === "signedIn" ? <Console /> : <AdminLogin />;
}

function AdminLogin() {
  const signIn = useAdminAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/logo-mark.png" alt="" className="size-14 rounded-xs" />
          <Wordmark className="text-2xl" />
          <span className="label-micro text-muted-foreground">Yönetim konsolu</span>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="admin-email">E-posta</Label>
                <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-password">Şifre</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="admin-password"
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" disabled={busy} data-testid="admin-submit" size="lg">
                {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
                {busy ? "Giriş yapılıyor" : "Giriş yap"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">{BRAND_TAGLINE}</p>
      </div>
    </div>
  );
}

function Console() {
  const queryClient = useQueryClient();
  const admin = useAdminAuthStore((s) => s.admin);
  const signOut = useAdminAuthStore((s) => s.signOut);
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);

  const farms = useQuery({
    queryKey: ["admin", "farms"],
    queryFn: () => adminClient().platform.farms.query(),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "farms"] });

  const createFarm = useMutation({
    mutationFn: (input: typeof emptyDraft) =>
      adminClient().platform.createFarm.mutate({
        name: input.name.trim(),
        location: input.location.trim() || undefined,
        ownerFullName: input.ownerFullName.trim(),
        ownerEmail: input.ownerEmail.trim().toLowerCase(),
        ownerPassword: input.ownerPassword,
      }),
    onSuccess: (farm) => {
      void refresh();
      setDraft(null);
      toast.success(`${farm.name} açıldı`, { description: `Çiftlik kodu ${farm.code}. Şifreyi sahibine elden ver.` });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: (input: { farmId: string; status: "active" | "suspended" }) => adminClient().platform.setFarmStatus.mutate(input),
    onSuccess: (farm) => {
      void refresh();
      toast.success(farm.status === "suspended" ? `${farm.name} askıya alındı` : `${farm.name} yeniden açıldı`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = farms.data ?? [];
  const active = rows.filter((f) => f.status === "active").length;
  const animals = rows.reduce((sum, f) => sum + Number(f.animalCount ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2.5">
          <img src="/logo-mark.png" alt="" className="size-7 rounded-xs" />
          <Wordmark className="text-sm" />
          <span className="label-micro text-muted-foreground">Yönetim</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{admin?.fullName}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Çıkış yap" data-testid="admin-logout" onClick={() => void signOut()}>
            <LogOut />
          </Button>
        </div>
      </div>

      <PageHeader
        eyebrow="Kiracılar"
        title="Çiftlikler"
        description="Her çiftlik ayrı bir kiracı; verileri birbirinden yalıtık. Konsol hayvan kaydına dokunmaz."
        actions={
          <Button onClick={() => setDraft({ ...emptyDraft, ownerPassword: suggestPassword() })} data-testid="farm-add">
            <Plus /> Çiftlik aç
          </Button>
        }
      />

      <StatGrid className="lg:grid-cols-3">
        <StatTile label="Çiftlik" value={rows.length} hint={`${active} aktif`} testID="admin-farm-count" tone="brand" />
        <StatTile label="Toplam hayvan" value={animals} hint="Silinmemiş kayıtlar" testID="admin-animal-count" />
        <StatTile label="Askıda" value={rows.length - active} tone={rows.length - active ? "warning" : "default"} testID="admin-suspended-count" />
      </StatGrid>

      {farms.isError ? (
        <div className="mt-6">
          <EmptyState title="Çiftlik listesi alınamadı" description="Sunucuya ulaşılamıyor ya da oturum düştü." />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={farms.isLoading ? "Yükleniyor" : "Henüz çiftlik yok"} />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Çiftlik</TableHead>
                <TableHead>Kod</TableHead>
                <TableHead className="text-right">Hayvan</TableHead>
                <TableHead className="text-right">Kullanıcı</TableHead>
                <TableHead>Son giriş</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={f.id} className={f.status === "active" ? undefined : "opacity-55"} data-testid={`farm-row-${f.code}`}>
                  <TableCell className="font-medium">
                    {f.name}
                    {f.location ? <span className="block text-xs text-muted-foreground">{f.location}</span> : null}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="font-mono text-[13px] hover:text-primary"
                      title="Kodu kopyala"
                      onClick={() => void navigator.clipboard.writeText(f.code).then(() => toast.success("Çiftlik kodu kopyalandı"))}
                    >
                      {f.code} <Copy className="inline size-3 opacity-50" />
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(f.animalCount ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(f.userCount ?? 0)}</TableCell>
                  <TableCell className="text-muted-foreground">{f.lastLoginAt ? formatDateTime(f.lastLoginAt) : "hiç girilmedi"}</TableCell>
                  <TableCell>
                    <Badge variant={f.status === "active" ? "default" : "destructive"}>{f.status === "active" ? "aktif" : "askıda"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={f.status === "active" ? "Askıya al" : "Yeniden aç"}
                      data-testid={`farm-toggle-${f.code}`}
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ farmId: f.id, status: f.status === "active" ? "suspended" : "active" })}
                    >
                      {f.status === "active" ? <Ban /> : <Play />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        Askıya alınan çiftliğin kullanıcıları giriş yapamaz ve açık oturumları iptal edilir. Kayıtları silinmez, geri açılınca yerinde durur.
      </p>

      <Dialog open={draft != null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Çiftlik aç</DialogTitle>
            <DialogDescription>Çiftlik, ilk sahibi ve başlangıç kayıtları (ırklar, Ana sürü, stok kalemleri) birlikte oluşturulur.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                createFarm.mutate(draft);
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="farm-name">Çiftlik adı</Label>
                <Input id="farm-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="farm-name" autoFocus required minLength={2} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="farm-location">Konum</Label>
                <Input id="farm-location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} data-testid="farm-location" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="farm-owner">Sahip ad soyad</Label>
                <Input id="farm-owner" value={draft.ownerFullName} onChange={(e) => setDraft({ ...draft, ownerFullName: e.target.value })} data-testid="farm-owner" required minLength={2} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="farm-owner-email">Sahip e-posta</Label>
                <Input
                  id="farm-owner-email"
                  type="email"
                  value={draft.ownerEmail}
                  onChange={(e) => setDraft({ ...draft, ownerEmail: e.target.value })}
                  data-testid="farm-owner-email"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="farm-owner-password">Şifre</Label>
                <div className="flex gap-2">
                  <Input
                    id="farm-owner-password"
                    value={draft.ownerPassword}
                    onChange={(e) => setDraft({ ...draft, ownerPassword: e.target.value })}
                    className="font-mono"
                    data-testid="farm-owner-password"
                    minLength={8}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Kopyala"
                    onClick={() => void navigator.clipboard.writeText(draft.ownerPassword).then(() => toast.success("Şifre kopyalandı"))}
                  >
                    <Copy />
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, ownerPassword: suggestPassword() })}>
                    Yenile
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Sahibe elden verilir; sistem e-posta göndermez.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Vazgeç
                </Button>
                <Button type="submit" disabled={createFarm.isPending} data-testid="farm-save">
                  <Plus /> Çiftliği aç
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
