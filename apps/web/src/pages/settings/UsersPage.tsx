import { labels, type UserRole } from "@anka/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";
import { formatDateTime } from "@/utils/date";

const roles = Object.entries(labels.userRole) as [UserRole, string][];

/** Rolün ne yapabildiği; sahip hesabı açarken bunu görmeli. */
const roleHints: Record<UserRole, string> = {
  owner: "Her şeyi görür ve değiştirir; finans ve kullanıcı yönetimi yalnızca sahipte.",
  worker: "Hayvan, sağlık, tartım, gözlem ve stok girer. Finansı görmez.",
  vet: "Sağlık kayıtlarını girer, hayvan geçmişini okur.",
};

/** Elden verilecek şifre: okunabilir ama tahmin edilemez. Birbirine benzeyen harfler yok. */
function suggestPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length] ?? "x").join("");
}

interface Draft {
  userId: string | null;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
}

const emptyDraft: Draft = { userId: null, fullName: "", email: "", phone: "", role: "worker", password: "" };

/**
 * Kullanıcı yönetimi (Ayarlar > Kullanıcılar). Sunucudan okur, çevrimdışı çalışmaz:
 * hesap açmak zaten sunucuya ulaşmayı gerektiriyor ve bu kayıtlar senkron tablolarında değil.
 */
export function UsersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const list = useQuery({ ...trpc.users.list.queryOptions(), retry: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [passwordFor, setPasswordFor] = useState<{ id: string; name: string; password: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });

  const create = useMutation(
    trpc.users.create.mutationOptions({
      onSuccess: (u) => {
        void refresh();
        setDraft(null);
        toast.success(`${u?.fullName ?? "Kullanıcı"} eklendi`, { description: "Şifreyi kendisine elden ver; e-posta gönderilmiyor." });
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );
  const update = useMutation(
    trpc.users.update.mutationOptions({
      onSuccess: () => {
        void refresh();
        setDraft(null);
        toast.success("Kullanıcı güncellendi");
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );
  const setActive = useMutation(
    trpc.users.setActive.mutationOptions({
      onSuccess: (u) => {
        void refresh();
        toast.success(u?.active ? `${u.fullName} yeniden açıldı` : `${u?.fullName ?? "Kullanıcı"} devre dışı bırakıldı`);
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );
  const setPassword = useMutation(
    trpc.users.setPassword.mutationOptions({
      onSuccess: () => toast.success("Şifre değişti", { description: "Kullanıcının açık oturumları kapatıldı." }),
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );

  if (me && me.role !== "owner") return <Navigate to="/settings" replace />;

  const rows = list.data ?? [];
  const busy = create.isPending || update.isPending;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const phone = draft.phone.trim();
    if (draft.userId) {
      update.mutate({ userId: draft.userId, fullName: draft.fullName.trim(), role: draft.role, phone: phone || null });
    } else {
      create.mutate({
        email: draft.email.trim().toLowerCase(),
        password: draft.password,
        fullName: draft.fullName.trim(),
        role: draft.role,
        phone: phone || undefined,
      });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Ayarlar"
        title="Kullanıcılar"
        description="Bakıcı ve veteriner hesaplarını sahip açar. Sistem e-posta göndermez; şifreyi sen verirsin."
        actions={
          <Button onClick={() => setDraft({ ...emptyDraft, password: suggestPassword() })} data-testid="user-add">
            <Plus /> Kullanıcı ekle
          </Button>
        }
      />

      {list.isError ? (
        <EmptyState title="Kullanıcı listesi alınamadı" description="Bu ekran sunucuya bağlı çalışır; bağlantı gelince yeniden dene." />
      ) : rows.length === 0 ? (
        <EmptyState title={list.isLoading ? "Yükleniyor" : "Kullanıcı yok"} />
      ) : (
        <div className="overflow-hidden border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad soyad</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Son giriş</TableHead>
                <TableHead className="w-32 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id} className={u.active ? undefined : "opacity-55"} data-testid={`user-row-${u.email}`}>
                  <TableCell className="font-medium">
                    {u.fullName}
                    {u.id === me?.id ? <span className="label-micro ml-2 text-muted-foreground">sen</span> : null}
                  </TableCell>
                  <TableCell className="font-mono text-[13px]">{u.email}</TableCell>
                  <TableCell>{u.phone ?? "–"}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "owner" ? "default" : "outline"}>{labels.userRole[u.role]}</Badge>
                    {u.active ? null : (
                      <Badge variant="destructive" className="ml-1.5">
                        kapalı
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "hiç girmedi"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Düzenle"
                      data-testid={`user-edit-${u.email}`}
                      onClick={() => setDraft({ userId: u.id, fullName: u.fullName, email: u.email, phone: u.phone ?? "", role: u.role, password: "" })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Şifre sıfırla"
                      data-testid={`user-password-${u.email}`}
                      onClick={() => setPasswordFor({ id: u.id, name: u.fullName, password: suggestPassword() })}
                    >
                      <KeyRound />
                    </Button>
                    {u.id === me?.id ? null : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={u.active ? "Devre dışı bırak" : "Yeniden aç"}
                        data-testid={`user-toggle-${u.email}`}
                        onClick={() => setActive.mutate({ userId: u.id, active: !u.active })}
                        disabled={setActive.isPending}
                      >
                        {u.active ? <UserX /> : <UserCheck />}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        Devre dışı bırakılan kullanıcının açık oturumları hemen kapanır, girdiği kayıtlar yerinde durur. Çiftlikte her zaman en az bir aktif sahip kalır.
      </p>

      {/* Ekleme ve düzenleme aynı form; e-posta giriş kimliği olduğu için düzenlemede kilitli. */}
      <Dialog open={draft != null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.userId ? "Kullanıcıyı düzenle" : "Kullanıcı ekle"}</DialogTitle>
            <DialogDescription>
              {draft?.userId ? "E-posta giriş kimliği olduğu için değişmez." : "Şifreyi kullanıcıya elden ver; sistem e-posta göndermez."}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="user-name">Ad soyad</Label>
                <Input
                  id="user-name"
                  value={draft.fullName}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                  data-testid="user-name"
                  autoFocus
                  required
                  minLength={2}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="user-email">E-posta</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  data-testid="user-email"
                  disabled={draft.userId != null}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="user-phone">Telefon</Label>
                <Input id="user-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} data-testid="user-phone" inputMode="tel" />
              </div>
              <div className="grid gap-1.5">
                <Label>Rol</Label>
                <ToggleGroup type="single" variant="outline" value={draft.role} onValueChange={(v) => v && setDraft({ ...draft, role: v as UserRole })}>
                  {roles.map(([value, label]) => (
                    <ToggleGroupItem key={value} value={value} data-testid={`user-role-${value}`}>
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">{roleHints[draft.role]}</p>
              </div>
              {draft.userId ? null : (
                <div className="grid gap-1.5">
                  <Label htmlFor="user-password">Şifre</Label>
                  <PasswordField value={draft.password} onChange={(password) => setDraft({ ...draft, password })} testID="user-password" />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Vazgeç
                </Button>
                <Button type="submit" disabled={busy || draft.fullName.trim().length < 2} data-testid="user-save">
                  <ShieldCheck /> Kaydet
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={passwordFor != null} onOpenChange={(o) => !o && setPasswordFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Şifre sıfırla</DialogTitle>
            <DialogDescription>{passwordFor?.name} için yeni şifre. Kaydedince o kullanıcının açık oturumları kapanır.</DialogDescription>
          </DialogHeader>
          {passwordFor ? <PasswordField value={passwordFor.password} onChange={(password) => setPasswordFor({ ...passwordFor, password })} testID="reset-password" /> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPasswordFor(null)}>
              Vazgeç
            </Button>
            <Button
              disabled={setPassword.isPending || (passwordFor?.password.length ?? 0) < 8}
              data-testid="reset-password-save"
              onClick={() => {
                if (!passwordFor) return;
                setPassword.mutate({ userId: passwordFor.id, password: passwordFor.password }, { onSuccess: () => setPasswordFor(null) });
              }}
            >
              <KeyRound /> Şifreyi değiştir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Şifre alanı: açık gösterilir (sahip zaten elden verecek), kopyalanır, yeniden üretilir. */
function PasswordField({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" data-testid={testID} minLength={8} required />
        <Button type="button" variant="outline" size="icon" aria-label="Kopyala" onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success("Şifre kopyalandı"))}>
          <Copy />
        </Button>
        <Button type="button" variant="outline" onClick={() => onChange(suggestPassword())}>
          Yenile
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">En az 8 karakter. Kullanıcı kendi şifresini değiştiremez; sahip buradan sıfırlar.</p>
    </div>
  );
}
