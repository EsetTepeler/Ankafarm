import { formatKg, labels, type AnimalEvent, type AnimalStatus, type BirthType, type Origin, type Sex, type Species } from "@anka/shared";
import { ArrowLeftRight, Baby, Eye, HeartHandshake, History, LogOut, Pencil, Plus, QrCode, Scale, Star, Syringe, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { ZodError } from "zod";

import { WeightChart } from "@/charts/WeightChart";
import { DateField } from "@/components/DateField";
import { HealthForm } from "@/components/HealthForm";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PedigreeSection } from "@/features/animals/PedigreeSection";
import { useAnimal, type AnimalListItem } from "@/features/animals/repo";
import { useTimeline } from "@/features/animals/timeline";
import { BreedingDialog, BreedingSection, LambingDialog } from "@/features/breeding/BreedingSection";
import { ExitDialog } from "@/features/exits/ExitDialog";
import { MoveDialog } from "@/features/groups/MoveDialog";
import { QrDialog } from "@/features/qr/QrDialog";
import { undoExit, useExits } from "@/features/exits/repo";
import { ObservationDialog } from "@/features/observations/ObservationDialog";
import { deleteObservation, recentAbnormal, useObservations } from "@/features/observations/repo";
import { addHealth, deleteHealth, emptyHealthForm, healthStatus, useHealth, type HealthFormValues } from "@/features/health/repo";
import { addWeight, deleteWeight, useWeights } from "@/features/weights/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatAge, formatDate, formatDateTime, isoToDisplay, todayIso } from "@/utils/date";

const eventIcon: Record<AnimalEvent["type"], typeof Star> = {
  created: Star,
  weight: Scale,
  group_move: ArrowLeftRight,
  health: Syringe,
  breeding: HeartHandshake,
  lambing: Baby,
  exit: LogOut,
  observation: Eye,
};

export function AnimalPage() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const animal = useAnimal(id);
  const timeline = useTimeline(id);
  const weights = useWeights(id);
  const health = useHealth(id);
  const obs = useObservations(id);
  const exits = useExits(id);
  const [weightOpen, setWeightOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [breedingOpen, setBreedingOpen] = useState(false);
  const [lambingOpen, setLambingOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [tab, setTab] = useState("timeline");
  const a = animal.data;

  if (!a) return <EmptyState title={animal.isLoading ? "Yükleniyor" : "Hayvan bulunamadı"} />;

  const title = a.name ? `${a.tagNo} · ${a.name}` : a.tagNo;
  const weightRows = weights.data ?? [];
  const trend = weightRows.length >= 2 ? weightRows[0]!.weightKg - weightRows[1]!.weightKg : null;
  const hs = healthStatus(health.data ?? []);
  const abnormal = recentAbnormal(obs.data ?? []);
  const lastExit = exits.data?.[0];
  const healthBadge = hs.withdrawalUntil
    ? { text: `Arınma ${isoToDisplay(hs.withdrawalUntil)}'e kadar`, tone: "danger" }
    : hs.overdueCount > 0
      ? { text: `${hs.overdueCount} doz gecikmiş`, tone: "warn" }
      : hs.nextDueAt
        ? { text: `Sonraki doz ${isoToDisplay(hs.nextDueAt)}`, tone: "ok" }
        : { text: (health.data?.length ?? 0) > 0 ? "Sağlık: sorun yok" : "Sağlık kaydı yok", tone: "muted" };

  return (
    <>
      <PageHeader
        title={title}
        description={[labels.species[a.species as Species], labels.sex[a.sex as Sex], a.breedName, formatAge(a.birthDate), labels.animalStatus[a.status as AnimalStatus]].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="QR etiketi" onClick={() => setQrOpen(true)} data-testid="animal-qr">
              <QrCode />
            </Button>
            {role === "owner" ? (
              <Button asChild variant="outline" size="icon" aria-label="Değişiklik geçmişi">
                <Link to={`/audit?record=${a.id}`} data-testid="animal-audit">
                  <History />
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to={`/animals/${a.id}/edit`} data-testid="animal-edit">
                <Pencil /> Düzenle
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="event-add">
                  <Plus /> Olay ekle
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setWeightOpen(true)} data-testid="event-weight">
                  <Scale /> Tartım
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHealthOpen(true)} data-testid="event-health">
                  <Syringe /> Aşı, ilaç veya bakım
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setBreedingOpen(true)} data-testid="event-breeding">
                  <HeartHandshake /> Çiftleşme
                </DropdownMenuItem>
                {a.sex === "female" ? (
                  <DropdownMenuItem onSelect={() => setLambingOpen(true)} data-testid="event-lambing">
                    <Baby /> Doğum
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setObsOpen(true)} data-testid="event-observation">
                  <Eye /> Gözlem veya not
                </DropdownMenuItem>
                {a.status === "active" ? (
                  <DropdownMenuItem onSelect={() => setMoveOpen(true)} data-testid="event-move">
                    <ArrowLeftRight /> Grup değiştir
                  </DropdownMenuItem>
                ) : null}
                {a.status === "active" ? (
                  <DropdownMenuItem onSelect={() => setExitOpen(true)} data-testid="event-exit" className="text-danger">
                    <LogOut /> Sürüden çıkış
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill icon={Scale} tone={trend == null ? "muted" : trend > 0 ? "ok" : trend < 0 ? "warn" : "muted"} testID="badge-weight">
          {a.currentWeight == null ? "Tartım yok" : `${formatKg(a.currentWeight)}${trend == null ? "" : trend > 0 ? " ↑" : trend < 0 ? " ↓" : ""}`}
        </Pill>
        <Pill icon={Syringe} tone={healthBadge.tone} testID="badge-health">
          {healthBadge.text}
        </Pill>
        {a.isPregnant && a.expectedBirthAt ? (
          <Pill icon={Baby} tone="ok" testID="badge-pregnant">
            Gebe · {isoToDisplay(a.expectedBirthAt)}
          </Pill>
        ) : null}
        {abnormal.length ? (
          <Pill icon={Eye} tone="warn" testID="badge-observation">
            {abnormal.length} olağandışı gözlem, son 3 gün
          </Pill>
        ) : null}
        {a.status !== "active" && lastExit ? (
          <Pill icon={LogOut} tone="danger" testID="badge-exit">
            {labels.exitType[lastExit.type as keyof typeof labels.exitType]} · {isoToDisplay(lastExit.exitedAt)}
          </Pill>
        ) : null}
        <Pill tone="muted" testID="badge-group">{a.groupName ?? "Grup yok"}</Pill>
        {a.syncSeq === 0 ? <Pill tone="muted">Senkron bekliyor</Pill> : null}
      </div>

      {a.status !== "active" && lastExit && role === "owner" ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm">
          <span>
            Bu hayvan {isoToDisplay(lastExit.exitedAt)} tarihinde sürüden çıktı{lastExit.reason ? `: ${lastExit.reason}` : ""}.
          </span>
          <Button size="sm" variant="outline" onClick={() => void undoExit(lastExit.id, a.id).then(() => toast.success("Çıkış geri alındı, hayvan yeniden aktif"))} data-testid="exit-undo">
            <Undo2 /> Geri al
          </Button>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            Olaylar
          </TabsTrigger>
          <TabsTrigger value="summary" data-testid="tab-summary">
            Özet
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            Sağlık
          </TabsTrigger>
          <TabsTrigger value="weight" data-testid="tab-weight">
            Kilo
          </TabsTrigger>
          <TabsTrigger value="breeding" data-testid="tab-breeding">
            Üreme
          </TabsTrigger>
          <TabsTrigger value="pedigree" data-testid="tab-pedigree">
            Soy ağacı
          </TabsTrigger>
          <TabsTrigger value="observations" data-testid="tab-observations">
            Gözlemler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card>
            <CardContent className="pt-6">
              {timeline.data?.length === 0 ? <EmptyState title="Henüz olay yok" /> : null}
              <ol className="relative ml-3 border-l">
                {(timeline.data ?? []).map((ev) => {
                  const Icon = eventIcon[ev.type];
                  return (
                    <li key={ev.id} className="mb-6 ml-6" data-testid={`timeline-${ev.type}`}>
                      <span className="absolute -left-3 flex size-6 items-center justify-center rounded-full border bg-background">
                        <Icon className="size-3.5 text-muted-foreground" />
                      </span>
                      <p className="text-sm font-medium">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">{[formatDateTime(ev.occurredAt), ev.summary].filter(Boolean).join(" · ")}</p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              <Field label="Doğum" value={a.birthDate ? `${isoToDisplay(a.birthDate)}${a.birthDateEstimated ? " (tahmini)" : ""}${a.birthType ? ` · ${labels.birthType[a.birthType as BirthType]}` : ""}` : "Bilinmiyor"} />
              <Field
                label="Köken"
                value={
                  a.origin === "purchased"
                    ? [labels.origin[a.origin as Origin], a.acquiredAt ? isoToDisplay(a.acquiredAt) : null, a.source, a.purchasePrice != null ? `${a.purchasePrice} TL` : null].filter(Boolean).join(" · ")
                    : labels.origin[a.origin as Origin]
                }
              />
              <Field label="Irk" value={[a.breedName, a.breedNote].filter(Boolean).join(" · ") || "–"} />
              <Field label="Grup" value={a.groupName ?? "–"} />
              {a.rfid ? <Field label="RFID" value={a.rfid} /> : null}
              {a.notes ? <Field label="Not" value={a.notes} /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card>
            <CardContent className="grid gap-2 pt-6">
              {health.data?.length === 0 ? <EmptyState title="Henüz sağlık kaydı yok" /> : null}
              {(health.data ?? []).map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" data-testid={`health-row-${h.type}`}>
                  <div className="grid">
                    <span className="font-medium">{[labels.healthType[h.type as keyof typeof labels.healthType], h.productName].filter(Boolean).join(" · ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {[formatDate(h.appliedAt), h.dose != null ? `${h.dose} ${h.doseUnit ?? ""}`.trim() : null, h.vetName ? `Vet. ${h.vetName}` : null, h.nextDueAt ? `sonraki ${isoToDisplay(h.nextDueAt)}` : null, h.withdrawalUntil ? `arınma bitişi ${isoToDisplay(h.withdrawalUntil)}` : null, h.batchId ? "toplu" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {role === "owner" ? (
                    <Button size="icon" variant="ghost" aria-label="Sil" onClick={() => void deleteHealth(h.id, "yanlış giriş")}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weight">
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <WeightChart points={weightRows.map((w) => ({ date: w.weighedAt.slice(0, 10), kg: w.weightKg }))} />
              {weightRows.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <div className="grid">
                    <span className="font-medium">{formatKg(w.weightKg)}</span>
                    <span className="text-xs text-muted-foreground">{[formatDate(w.weighedAt), w.note].filter(Boolean).join(" · ")}</span>
                  </div>
                  {role === "owner" ? (
                    <Button size="icon" variant="ghost" aria-label="Sil" onClick={() => void deleteWeight(w.id, a.id, "yanlış giriş")}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
              {weightRows.length === 0 ? <EmptyState title="Henüz tartım yok" /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="observations">
          <Card>
            <CardContent className="grid gap-2 pt-6">
              {obs.data?.length === 0 ? <EmptyState title="Henüz gözlem yok" description="Topallama, iştahsızlık, öksürük gibi sahada gördüklerini buraya gir; teşhis veterinerin işi." /> : null}
              {(obs.data ?? []).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm" data-testid={`obs-row-${o.category}`}>
                  <div className="grid">
                    <span className="font-medium">
                      {labels.observationCategory[o.category as keyof typeof labels.observationCategory]}
                      {o.severity !== "normal" ? ` · ${labels.severity[o.severity as keyof typeof labels.severity]}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{[formatDate(o.observedAt), (o.tags as string[]).join(", "), o.note].filter(Boolean).join(" · ")}</span>
                  </div>
                  {role === "owner" ? (
                    <Button size="icon" variant="ghost" aria-label="Sil" onClick={() => void deleteObservation(o.id)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breeding">
          <BreedingSection animal={a} />
        </TabsContent>
        <TabsContent value="pedigree">
          <PedigreeSection animalId={a.id} />
        </TabsContent>
      </Tabs>

      <WeightDialog open={weightOpen} onOpenChange={setWeightOpen} animal={a} />
      <HealthDialog open={healthOpen} onOpenChange={setHealthOpen} animal={a} />
      <BreedingDialog
        open={breedingOpen}
        onOpenChange={setBreedingOpen}
        animal={a}
        onSaved={() => {
          toast.success("Çiftleşme kaydedildi");
          setTab("breeding");
        }}
      />
      <QrDialog open={qrOpen} onOpenChange={setQrOpen} animalId={a.id} tagNo={a.tagNo} name={a.name} />
      <MoveDialog open={moveOpen} onOpenChange={setMoveOpen} animalIds={[a.id]} currentGroupId={a.groupId} onMoved={() => setTab("timeline")} />
      <ObservationDialog open={obsOpen} onOpenChange={setObsOpen} animalId={a.id} tagNo={a.tagNo} />
      <ExitDialog open={exitOpen} onOpenChange={setExitOpen} animalId={a.id} tagNo={a.tagNo} onSaved={() => setTab("timeline")} />
      {a.sex === "female" ? <LambingDialog open={lambingOpen} onOpenChange={setLambingOpen} animal={a} onSaved={(ids) => toast.success(`Doğum kaydedildi, ${ids.length} yavru açıldı`)} /> : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Pill({ icon: Icon, tone, children, testID }: { icon?: typeof Star; tone: string; children: React.ReactNode; testID?: string }) {
  return (
    <Badge
      variant="outline"
      data-testid={testID}
      className={cn("gap-1.5 py-1", tone === "ok" && "border-success/40 bg-success/10", tone === "warn" && "border-warning/40 bg-warning/15", tone === "danger" && "border-danger/40 bg-danger/10 text-danger")}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </Badge>
  );
}

function WeightDialog({ open, onOpenChange, animal }: { open: boolean; onOpenChange: (o: boolean) => void; animal: AnimalListItem }) {
  const [kg, setKg] = useState("");
  const [date, setDate] = useState<string | null>(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const value = Number(kg.trim().replace(",", "."));
      if (!kg.trim() || Number.isNaN(value)) throw new Error("Kilo sayı olmalı");
      if (!date) throw new Error("Tarih gerekli");
      await addWeight({ animalId: animal.id, weightKg: value, weighedAt: new Date(`${date}T12:00:00`).toISOString(), note: note.trim() || null });
      toast.success(`${formatKg(value)} kaydedildi`);
      setKg("");
      setNote("");
      setDate(todayIso());
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tartım · {animal.tagNo}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="weight-kg">Kilo, kg</Label>
            <Input id="weight-kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} data-testid="weight-kg" autoFocus />
          </div>
          <DateField id="weight-date" label="Tarih" value={date} onChange={setDate} testID="weight-date" required />
          <div className="grid gap-1.5">
            <Label htmlFor="weight-note">Not</Label>
            <Input id="weight-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy || !kg.trim()} data-testid="weight-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HealthDialog({ open, onOpenChange, animal }: { open: boolean; onOpenChange: (o: boolean) => void; animal: AnimalListItem }) {
  const [form, setForm] = useState<HealthFormValues>(emptyHealthForm);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await addHealth(animal.id, form);
      toast.success(`${labels.healthType[form.type]} kaydedildi`);
      setForm(emptyHealthForm);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Sağlık kaydı · {animal.tagNo}</DialogTitle>
        </DialogHeader>
        <HealthForm values={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="health-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
