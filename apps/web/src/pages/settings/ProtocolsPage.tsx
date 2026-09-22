import { labels, type HealthType, type ProtocolTrigger, type Species } from "@anka/shared";
import { CalendarClock, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { ZodError } from "zod";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addProtocolItem, createSampleProtocol, deleteProtocol, deleteProtocolItem, useProtocolTasks, useProtocols } from "@/features/protocols/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { isoToDisplay } from "@/utils/date";

const healthTypes = Object.entries(labels.healthType) as [HealthType, string][];
const triggers = Object.entries(labels.protocolTrigger) as [ProtocolTrigger, string][];

function triggerText(trigger: ProtocolTrigger, value: number): string {
  if (trigger === "age_days") return `${value} günlükken`;
  if (trigger === "interval_days") return `her ${value} günde bir`;
  return `her yıl ${value}. ay`;
}

/**
 * Aşı planlaması (madde 3.2): çiftliğin yıllık planlaması; hatırlatıcılar buradan türetilir.
 * Sözlük çiftlik sahibinin kullandığı gibi: kapsayan şey "planlama", içindeki her satır bir "program"
 * (enterotoksemi programı, tırnak bakımı programı...).
 */
export function ProtocolsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const protocols = useProtocols();
  const tasks = useProtocolTasks(60);
  const [itemFor, setItemFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (role && role !== "owner" && role !== "vet") return <Navigate to="/" replace />;

  async function sample() {
    setBusy(true);
    try {
      await createSampleProtocol("sheep");
      toast.success("Örnek planlama eklendi; kendi takvimine göre düzenle");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = protocols.data ?? [];
  const loaded = protocols.data !== undefined;

  return (
    <>
      <PageHeader
        title="Aşı ve bakım planlaması"
        description="Planlamadaki her program, her hayvan için hatırlatıcıya dönüşür"
        actions={
          loaded && rows.length === 0 ? (
            <Button onClick={() => void sample()} disabled={busy} data-testid="protocol-sample">
              <Sparkles /> Örnek planlamayı ekle
            </Button>
          ) : null
        }
      />

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Yükleniyor</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Henüz planlama yok" description="Örnek planlamayı ekleyip kendi takvimine göre düzenleyebilirsin: enterotoksemi, çiçek, parazit, tırnak bakımı." />
      ) : (
        <div className="grid gap-4">
          {rows.map((p) => (
            <Card key={p.id} data-testid={`protocol-${p.name}`}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>
                    {p.name} <Badge variant="outline">{labels.species[p.species as Species]}</Badge>
                  </CardTitle>
                  {p.notes ? <CardDescription>{p.notes}</CardDescription> : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setItemFor(p.id)} data-testid={`protocol-add-item-${p.name}`}>
                    <Plus /> Ekle
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => void deleteProtocol(p.id).then(() => toast.success("Planlama silindi"))}
                    aria-label="Planlamayı sil"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2">
                {p.items.length === 0 ? <EmptyState title="Program yok" description="Aşı, ilaç veya bakım programı ekle." /> : null}
                {p.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40" data-testid={`protocol-item-${i.productName ?? i.type}`}>
                    <span className="grid">
                      <span className="font-medium">
                        {i.productName ?? labels.healthType[i.type as HealthType]}
                        <span className="text-muted-foreground"> · {labels.healthType[i.type as HealthType]}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {triggerText(i.trigger as ProtocolTrigger, i.value)}
                        {i.notes ? ` · ${i.notes}` : ""}
                      </span>
                    </span>
                    <Button variant="ghost" size="icon" aria-label="Programı sil" onClick={() => void deleteProtocolItem(i.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            Planlamadan çıkan işler
            <Badge variant="outline" data-testid="protocol-task-count">
              {tasks.data?.length ?? 0}
            </Badge>
          </CardTitle>
          <CardDescription>Önümüzdeki 60 gün. Sağlık kaydı girilince iş kendiliğinden ileri kayar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1">
          {tasks.data?.length === 0 ? <EmptyState title="Yaklaşan iş yok" /> : null}
          {(tasks.data ?? []).slice(0, 30).map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-sm" data-testid="protocol-task">
              <span className="truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{isoToDisplay(t.dueAt)}</span>
            </div>
          ))}
          {(tasks.data?.length ?? 0) > 30 ? <p className="text-xs text-muted-foreground">ve {(tasks.data?.length ?? 0) - 30} iş daha</p> : null}
        </CardContent>
      </Card>

      <ItemDialog protocolId={itemFor} onClose={() => setItemFor(null)} />
    </>
  );
}

function ItemDialog({ protocolId, onClose }: { protocolId: string | null; onClose: () => void }) {
  const [type, setType] = useState<HealthType>("vaccine");
  const [productName, setProductName] = useState("");
  const [trigger, setTrigger] = useState<ProtocolTrigger>("interval_days");
  const [value, setValue] = useState("180");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!protocolId) return;
    setBusy(true);
    try {
      await addProtocolItem({ protocolId, type, productName: productName.trim() || null, trigger, value: Number(value) });
      toast.success("Program eklendi");
      setProductName("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={protocolId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Program</DialogTitle>
            <DialogDescription>Ne, ne zaman uygulanacak? Her program her hayvan için ayrı hatırlatıcı üretir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="pitem-type">Tür</Label>
            <Select value={type} onValueChange={(v) => setType(v as HealthType)}>
              <SelectTrigger id="pitem-type" data-testid="pitem-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {healthTypes.map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pitem-product">Program adı</Label>
            <Input id="pitem-product" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Enterotoksemi" data-testid="pitem-product" />
          </div>
          <ToggleGroup type="single" variant="outline" value={trigger} onValueChange={(v) => v && setTrigger(v as ProtocolTrigger)} className="flex-wrap justify-start">
            {triggers.map(([v, label]) => (
              <ToggleGroupItem key={v} value={v} data-testid={`pitem-trigger-${v}`}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid gap-1.5">
            <Label htmlFor="pitem-value">{trigger === "fixed_month" ? "Ay (1-12)" : "Gün"}</Label>
            <Input id="pitem-value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} data-testid="pitem-value" />
            <p className="text-xs text-muted-foreground">{triggerText(trigger, Number(value) || 0)}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy || !value.trim()} data-testid="pitem-save">
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
