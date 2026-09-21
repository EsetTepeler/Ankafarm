import { labels, type BirthDifficulty, type BreedingMethod, type PregnancyResult, type Sex, type Species } from "@anka/shared";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { EntityPicker, type PickerItem } from "@/components/EntityPicker";
import { EmptyState } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { describeRelatedness, relatedness, type Relatedness } from "@/features/animals/pedigree";
import { useParentCandidates, type AnimalListItem } from "@/features/animals/repo";
import { addBreeding, breedingSummary, deleteBreeding, setPregnancyResult, useBreedings, type BreedingSummary } from "@/features/breeding/repo";
import { addLambing, useLambings, type NewLamb } from "@/features/lambing/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { isoToDisplay, todayIso } from "@/utils/date";

/** Profildeki Üreme sekmesi: çiftleşmeler, gebelik kontrolü, doğumlar. */
export function BreedingSection({ animal }: { animal: AnimalListItem }) {
  const role = useAuthStore((s) => s.user?.role);
  const breedings = useBreedings(animal.id);
  const lambings = useLambings(animal.id);
  const isFemale = animal.sex === "female";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Çiftleşmeler</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {animal.isPregnant && animal.expectedBirthAt ? (
            <p className="text-sm font-medium" data-testid="pregnancy-line">
              Gebe · beklenen doğum {isoToDisplay(animal.expectedBirthAt)}
            </p>
          ) : null}
          {breedings.data?.length === 0 ? <EmptyState title="Henüz çiftleşme kaydı yok" /> : null}
          {(breedings.data ?? []).map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40" data-testid="breeding-row">
              <div className="grid">
                <span className="font-medium">
                  {isoToDisplay(b.matedAt)} · {labels.breedingMethod[b.method as BreedingMethod] ?? b.method}
                </span>
                <span className="text-xs text-muted-foreground">
                  beklenen doğum {isoToDisplay(b.expectedBirthAt)}
                  {isFemale ? ` · ${labels.pregnancyResult[b.pregnancyResult as PregnancyResult]}${b.pregnancyCheckedAt ? ` (${isoToDisplay(b.pregnancyCheckedAt)})` : ""}` : ""}
                </span>
              </div>
              {isFemale && b.pregnancyResult === "pending" ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => void setPregnancyResult(b.id, b.femaleId, "positive", todayIso())} data-testid="pregnancy-positive">
                    <Check /> Gebe
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void setPregnancyResult(b.id, b.femaleId, "negative", todayIso())} data-testid="pregnancy-negative">
                    <X /> Değil
                  </Button>
                </div>
              ) : role === "owner" ? (
                <Button size="icon" variant="ghost" aria-label="Sil" onClick={() => void deleteBreeding(b.id, b.femaleId, "yanlış giriş")}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {isFemale ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Doğumlar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {lambings.data?.length === 0 ? <EmptyState title="Henüz doğum kaydı yok" /> : null}
            {(lambings.data ?? []).map((l) => (
              <div key={l.id} className="rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40" data-testid="lambing-row">
                <span className="font-medium">
                  {isoToDisplay(l.bornAt)} · {l.liveCount} canlı{l.stillbornCount ? `, ${l.stillbornCount} ölü` : ""}
                </span>
                <span className="block text-xs text-muted-foreground">{[labels.birthDifficulty[l.difficulty as BirthDifficulty], l.notes].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

const summaryText = (s: BreedingSummary | null, sex: Sex) =>
  !s ? "" : sex === "female" ? `${s.births} doğum · ${s.liveLambs} canlı yavru${s.stillborn ? ` · ${s.stillborn} ölü doğum` : ""}` : `${s.sired} yavrunun babası`;

/** Çiftleşme kaydı: eş seçilince akrabalık ve geçmiş performans anında görünür. */
export function BreedingDialog({ open, animal, onOpenChange, onSaved }: { open: boolean; animal: AnimalListItem; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const isFemale = animal.sex === "female";
  const partners = useParentCandidates(animal.species as Species, isFemale ? "male" : "female", animal.id);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [method, setMethod] = useState<BreedingMethod>("natural");
  const [date, setDate] = useState<string | null>(todayIso());
  const [notes, setNotes] = useState("");
  const [rel, setRel] = useState<Relatedness | null>(null);
  const [ownSummary, setOwnSummary] = useState<BreedingSummary | null>(null);
  const [partnerSummary, setPartnerSummary] = useState<BreedingSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const items: PickerItem[] = useMemo(() => (partners.data ?? []).map((p) => ({ id: p.id, label: p.tagNo, description: p.name })), [partners.data]);
  const partnerLabel = items.find((i) => i.id === partnerId)?.label ?? "";

  useEffect(() => {
    if (open) void breedingSummary(animal.id).then(setOwnSummary);
  }, [open, animal.id]);

  useEffect(() => {
    if (!partnerId) {
      setRel(null);
      setPartnerSummary(null);
      return;
    }
    const femaleId = isFemale ? animal.id : partnerId;
    const maleId = isFemale ? partnerId : animal.id;
    void relatedness(femaleId, maleId).then(setRel);
    void breedingSummary(partnerId).then(setPartnerSummary);
  }, [partnerId, animal.id, isFemale]);

  const relText = rel ? describeRelatedness(rel) : null;

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const femaleId = isFemale ? animal.id : partnerId;
      const maleId = isFemale ? partnerId : animal.id;
      if (!femaleId) throw new Error("Dişi seçilmeli");
      await addBreeding({ femaleId, maleId, method, matedAt: date, notes: notes.trim() || null, species: animal.species as Species });
      onSaved();
      setPartnerId(null);
      setNotes("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Çiftleşme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <EntityPicker label={isFemale ? "Koç" : "Koyun"} items={items} value={partnerId} onChange={setPartnerId} noneLabel="Bilinmiyor" testID="breeding-partner" />
          {relText ? (
            <Badge
              variant="outline"
              data-testid="relatedness"
              className={cn(relText.level === "danger" && "border-danger/40 bg-danger/10 text-danger", relText.level === "warn" && "border-warning/40 bg-warning/15")}
            >
              {relText.text}
            </Badge>
          ) : null}
          <div className="rounded-lg bg-muted p-3 text-xs">
            <p className="mb-1 font-medium">Geçmiş performans</p>
            <p data-testid="summary-own">
              {animal.tagNo}: {summaryText(ownSummary, animal.sex as Sex) || "kayıt yok"}
            </p>
            {partnerId ? (
              <p data-testid="summary-partner">
                {partnerLabel}: {summaryText(partnerSummary, isFemale ? "male" : "female") || "kayıt yok"}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Yöntem</Label>
              <ToggleGroup type="single" variant="outline" value={method} onValueChange={(v) => v && setMethod(v as BreedingMethod)}>
                <ToggleGroupItem value="natural">{labels.breedingMethod.natural}</ToggleGroupItem>
                <ToggleGroupItem value="ai">{labels.breedingMethod.ai}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <DateField id="breeding-date" label="Çiftleşme tarihi" value={date} onChange={setDate} testID="breeding-date" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="breeding-notes">Not</Label>
            <Input id="breeding-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy || (!isFemale && !partnerId)} data-testid="breeding-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Doğum kaydı: her canlı yavru için küpe ve cinsiyet; yavrular otomatik hayvan olur. */
export function LambingDialog({ open, animal, onOpenChange, onSaved }: { open: boolean; animal: AnimalListItem; onOpenChange: (o: boolean) => void; onSaved: (lambIds: string[]) => void }) {
  const navigate = useNavigate();
  const [date, setDate] = useState<string | null>(todayIso());
  const [difficulty, setDifficulty] = useState<BirthDifficulty>("easy");
  const [stillborn, setStillborn] = useState("0");
  const [lambs, setLambs] = useState<NewLamb[]>([{ tagNo: "", sex: "female" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const setLamb = (i: number, patch: Partial<NewLamb>) => setLambs((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Doğum tarihi gerekli");
      const live = lambs.filter((l) => l.tagNo.trim());
      const still = Number(stillborn) || 0;
      if (live.length === 0 && still === 0) throw new Error("En az bir canlı yavru küpesi veya ölü doğum sayısı girin");
      const result = await addLambing({ motherId: animal.id, bornAt: date, difficulty, stillbornCount: still, lambs: live, notes: notes.trim() || null });
      onSaved(result.lambIds);
      setLambs([{ tagNo: "", sex: "female" }]);
      setNotes("");
      onOpenChange(false);
      if (result.lambIds.length === 1) navigate(`/animals/${result.lambIds[0]}`);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Doğum</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField id="lambing-date" label="Doğum tarihi" value={date} onChange={setDate} testID="lambing-date" required />
            <div className="grid gap-1.5">
              <Label htmlFor="lambing-stillborn">Ölü doğum sayısı</Label>
              <Input id="lambing-stillborn" inputMode="numeric" value={stillborn} onChange={(e) => setStillborn(e.target.value)} data-testid="lambing-stillborn" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Doğum zorluğu</Label>
            <ToggleGroup type="single" variant="outline" value={difficulty} onValueChange={(v) => v && setDifficulty(v as BirthDifficulty)}>
              {(Object.entries(labels.birthDifficulty) as [BirthDifficulty, string][]).map(([value, label]) => (
                <ToggleGroupItem key={value} value={value}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid gap-2">
            <Label>Canlı yavrular</Label>
            {lambs.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder={`Yavru ${i + 1} küpe`} value={l.tagNo} onChange={(e) => setLamb(i, { tagNo: e.target.value })} className="uppercase" data-testid={`lamb-tag-${i}`} />
                <ToggleGroup type="single" variant="outline" value={l.sex} onValueChange={(v) => v && setLamb(i, { sex: v as Sex })}>
                  <ToggleGroupItem value="female" data-testid={`lamb-female-${i}`}>
                    Dişi
                  </ToggleGroupItem>
                  <ToggleGroupItem value="male" data-testid={`lamb-male-${i}`}>
                    Erkek
                  </ToggleGroupItem>
                </ToggleGroup>
                {lambs.length > 1 ? (
                  <Button size="icon" variant="ghost" aria-label="Kaldır" onClick={() => setLambs((p) => p.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setLambs((p) => [...p, { tagNo: "", sex: "female" }])} disabled={lambs.length >= 6} data-testid="lamb-add">
              <Plus /> Yavru ekle
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lambing-notes">Not</Label>
            <Input id="lambing-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="lambing-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
