import { DEFAULT_GROUP_NAME, labels, type BirthType, type Origin, type Sex, type Species } from "@anka/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { EntityPicker, type PickerItem } from "@/components/EntityPicker";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createAnimal, DuplicateTagError, updateAnimal, useAnimal, useParentCandidates } from "@/features/animals/repo";
import { createBreed, useBreeds } from "@/features/breeds/repo";
import { useGroups } from "@/features/groups/repo";
import { errorMessage } from "@/lib/auth";
import { todayIso } from "@/utils/date";

interface FormState {
  origin: Origin;
  tagNo: string;
  name: string;
  species: Species;
  sex: Sex;
  breedId: string | null;
  breedNote: string;
  motherId: string | null;
  fatherId: string | null;
  birthDate: string | null;
  birthDateEstimated: boolean;
  birthType: BirthType | null;
  acquiredAt: string | null;
  source: string;
  purchasePrice: string;
  groupId: string | null;
  notes: string;
}

const empty: FormState = {
  origin: "purchased",
  tagNo: "",
  name: "",
  species: "sheep",
  sex: "female",
  breedId: null,
  breedNote: "",
  motherId: null,
  fatherId: null,
  birthDate: null,
  birthDateEstimated: false,
  birthType: null,
  acquiredAt: todayIso(),
  source: "",
  purchasePrice: "",
  groupId: null,
  notes: "",
};

const fieldLabels: Record<string, string> = {
  tagNo: "Küpe numarası",
  breedId: "Irk",
  motherId: "Anne",
  fatherId: "Baba",
  birthDate: "Doğum tarihi",
  acquiredAt: "Alınma tarihi",
  purchasePrice: "Fiyat",
  groupId: "Grup",
};

export function AnimalFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const existing = useAnimal(id);

  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [newBreed, setNewBreed] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const breeds = useBreeds(form.species);
  const groups = useGroups();
  const mothers = useParentCandidates(form.species, "female", id);
  const fathers = useParentCandidates(form.species, "male", id);

  useEffect(() => {
    const a = existing.data;
    if (!editing || !a || loadedId === a.id) return;
    setForm({
      origin: a.origin as Origin,
      tagNo: a.tagNo,
      name: a.name ?? "",
      species: a.species as Species,
      sex: a.sex as Sex,
      breedId: a.breedId,
      breedNote: a.breedNote ?? "",
      motherId: a.motherId,
      fatherId: a.fatherId,
      birthDate: a.birthDate,
      birthDateEstimated: a.birthDateEstimated,
      birthType: (a.birthType as BirthType | null) ?? null,
      acquiredAt: a.acquiredAt,
      source: a.source ?? "",
      purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : "",
      groupId: a.groupId,
      notes: a.notes ?? "",
    });
    setLoadedId(a.id);
  }, [editing, existing.data, loadedId]);

  useEffect(() => {
    if (editing || form.groupId || !groups.data?.length) return;
    const main = groups.data.find((g) => g.name === DEFAULT_GROUP_NAME) ?? groups.data[0];
    if (main) setForm((f) => ({ ...f, groupId: main.id }));
  }, [editing, form.groupId, groups.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const breedItems: PickerItem[] = useMemo(() => (breeds.data ?? []).map((b) => ({ id: b.id, label: b.name })), [breeds.data]);
  const groupItems: PickerItem[] = useMemo(() => (groups.data ?? []).map((g) => ({ id: g.id, label: g.name })), [groups.data]);
  const motherItems: PickerItem[] = useMemo(() => (mothers.data ?? []).map((m) => ({ id: m.id, label: m.tagNo, description: m.name })), [mothers.data]);
  const fatherItems: PickerItem[] = useMemo(() => (fathers.data ?? []).map((m) => ({ id: m.id, label: m.tagNo, description: m.name })), [fathers.data]);
  const breedIsCross = breedItems.find((b) => b.id === form.breedId)?.label === "Melez";

  function selectMother(motherId: string | null) {
    set("motherId", motherId);
    const mother = mothers.data?.find((m) => m.id === motherId);
    if (mother?.breedId && !form.breedId) set("breedId", mother.breedId);
  }

  function buildInput() {
    const price = form.purchasePrice.trim().replace(",", ".");
    const base = {
      tagNo: form.tagNo,
      name: form.name.trim() || null,
      species: form.species,
      sex: form.sex,
      origin: form.origin,
      breedId: form.breedId,
      breedNote: breedIsCross && form.breedNote.trim() ? form.breedNote.trim() : null,
      birthDate: form.birthDate,
      birthDateEstimated: form.birthDateEstimated,
      birthType: form.origin === "born_here" ? form.birthType : null,
      motherId: form.origin === "born_here" ? form.motherId : null,
      fatherId: form.origin === "born_here" ? form.fatherId : null,
      acquiredAt: form.origin === "purchased" ? form.acquiredAt : null,
      source: form.origin === "purchased" && form.source.trim() ? form.source.trim() : null,
      purchasePrice: form.origin === "purchased" && price ? Number(price) : null,
      groupId: form.groupId,
      notes: form.notes.trim() || null,
      status: "active" as const,
    };
    if (base.purchasePrice !== null && Number.isNaN(base.purchasePrice)) {
      throw new ZodError([{ code: "custom", path: ["purchasePrice"], message: "Fiyat sayı olmalı" }]);
    }
    return base;
  }

  async function save(andNew: boolean) {
    setBusy(true);
    setErrors({});
    try {
      const input = buildInput();
      if (editing && id) {
        await updateAnimal(id, input);
        toast.success("Kaydedildi");
        navigate(`/animals/${id}`);
        return;
      }
      const newId = await createAnimal(input);
      if (andNew) {
        setForm((f) => ({ ...empty, origin: f.origin, species: f.species, sex: f.sex, groupId: f.groupId, acquiredAt: f.acquiredAt, source: f.source }));
        toast.success(`${input.tagNo.toUpperCase()} kaydedildi, sıradaki`);
        document.getElementById("animal-tag")?.focus();
      } else {
        navigate(`/animals/${newId}`);
      }
    } catch (err) {
      if (err instanceof ZodError) {
        const next: Record<string, string> = {};
        for (const issue of err.issues) {
          const key = String(issue.path[0] ?? "form");
          if (!next[key]) next[key] = issue.message;
        }
        setErrors(next);
        const first = Object.entries(next)[0];
        if (first) toast.error(`${fieldLabels[first[0]] ?? first[0]}: ${first[1]}`);
      } else if (err instanceof DuplicateTagError) {
        setErrors({ tagNo: err.message });
        toast.error(err.message);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function addBreed() {
    const name = newBreed?.trim();
    if (!name) return;
    try {
      const breedId = await createBreed({ name, species: form.species });
      set("breedId", breedId);
      setNewBreed(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <PageHeader title={editing ? "Hayvanı düzenle" : "Hayvan ekle"} description={editing ? existing.data?.tagNo : "Küpe numarası ve köken zorunlu, gerisi sonra da girilebilir"} />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kimlik</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Nereden geldi?</Label>
              <ToggleGroup type="single" variant="outline" value={form.origin} onValueChange={(v) => v && set("origin", v as Origin)}>
                <ToggleGroupItem value="born_here" data-testid="origin-born">
                  {labels.origin.born_here}
                </ToggleGroupItem>
                <ToggleGroupItem value="purchased" data-testid="origin-purchased">
                  {labels.origin.purchased}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Tür</Label>
                <ToggleGroup type="single" variant="outline" value={form.species} onValueChange={(v) => v && set("species", v as Species)}>
                  <ToggleGroupItem value="sheep">Koyun</ToggleGroupItem>
                  <ToggleGroupItem value="goat">Keçi</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="grid gap-1.5">
                <Label>Cinsiyet</Label>
                <ToggleGroup type="single" variant="outline" value={form.sex} onValueChange={(v) => v && set("sex", v as Sex)}>
                  <ToggleGroupItem value="female" data-testid="sex-female">
                    Dişi
                  </ToggleGroupItem>
                  <ToggleGroupItem value="male" data-testid="sex-male">
                    Erkek
                  </ToggleGroupItem>
                  <ToggleGroupItem value="castrated">Kısır</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="animal-tag">Küpe numarası</Label>
                <Input id="animal-tag" value={form.tagNo} onChange={(e) => set("tagNo", e.target.value)} className="uppercase" data-testid="animal-tag" aria-invalid={!!errors.tagNo} autoFocus />
                {errors.tagNo ? <p className="text-xs text-danger">{errors.tagNo}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="animal-name">İsim (isteğe bağlı)</Label>
                <Input id="animal-name" value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="animal-name" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{form.origin === "born_here" ? "Doğum" : "Alım"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {form.origin === "born_here" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EntityPicker label="Anne" items={motherItems} value={form.motherId} onChange={selectMother} testID="animal-mother" error={errors.motherId} />
                  <EntityPicker label="Baba (isteğe bağlı)" items={fatherItems} value={form.fatherId} onChange={(v) => set("fatherId", v)} testID="animal-father" noneLabel="Bilinmiyor" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateField id="animal-birthdate" label="Doğum tarihi" value={form.birthDate} onChange={(v) => set("birthDate", v)} testID="animal-birthdate" error={errors.birthDate} />
                  <div className="grid gap-1.5">
                    <Label>Doğum tipi</Label>
                    <ToggleGroup type="single" variant="outline" value={form.birthType ?? ""} onValueChange={(v) => set("birthType", (v || null) as BirthType | null)}>
                      {(Object.entries(labels.birthType) as [BirthType, string][]).map(([value, label]) => (
                        <ToggleGroupItem key={value} value={value}>
                          {label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DateField id="animal-acquired" label="Alınma tarihi" value={form.acquiredAt} onChange={(v) => set("acquiredAt", v)} testID="animal-acquired" error={errors.acquiredAt} />
                  <div className="grid gap-1.5">
                    <Label htmlFor="animal-source">Satıcı</Label>
                    <Input id="animal-source" value={form.source} onChange={(e) => set("source", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="animal-price">Fiyat, TL</Label>
                    <Input id="animal-price" inputMode="decimal" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} aria-invalid={!!errors.purchasePrice} />
                    {errors.purchasePrice ? <p className="text-xs text-danger">{errors.purchasePrice}</p> : null}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateField id="animal-birthdate" label="Doğum tarihi (biliniyorsa)" value={form.birthDate} onChange={(v) => set("birthDate", v)} testID="animal-birthdate" />
                  <div className="flex items-center gap-3 pt-6">
                    <Switch id="animal-estimated" checked={form.birthDateEstimated} onCheckedChange={(v) => set("birthDateEstimated", v)} />
                    <Label htmlFor="animal-estimated">Doğum tarihi tahmini</Label>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Irk ve grup</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <EntityPicker
                label="Irk"
                items={breedItems}
                value={form.breedId}
                onChange={(v) => set("breedId", v)}
                placeholder={form.origin === "purchased" ? "Seçilmeli" : "Anneden gelir, isteğe bağlı"}
                testID="animal-breed"
                error={errors.breedId}
                noneLabel="Irk yok"
                footer={
                  <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setNewBreed("")}>
                    Yeni ırk ekle
                  </Button>
                }
              />
              <EntityPicker label="Grup" items={groupItems} value={form.groupId} onChange={(v) => set("groupId", v)} testID="animal-group" noneLabel="Grup yok" />
            </div>
            {newBreed !== null ? (
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="new-breed">Yeni {labels.species[form.species].toLocaleLowerCase("tr")} ırkı</Label>
                  <Input id="new-breed" value={newBreed} onChange={(e) => setNewBreed(e.target.value)} autoFocus />
                </div>
                <Button type="button" variant="ghost" onClick={() => setNewBreed(null)}>
                  Vazgeç
                </Button>
                <Button type="button" onClick={() => void addBreed()} disabled={!newBreed.trim()}>
                  Ekle
                </Button>
              </div>
            ) : null}
            {breedIsCross ? (
              <div className="grid gap-1.5">
                <Label htmlFor="breed-note">Melez açıklaması</Label>
                <Input id="breed-note" value={form.breedNote} onChange={(e) => set("breedNote", e.target.value)} placeholder="İle de France x Kıvırcık" />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="animal-notes">Not</Label>
              <Textarea id="animal-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Vazgeç
          </Button>
          {!editing ? (
            <Button type="button" variant="outline" onClick={() => void save(true)} disabled={busy || !form.tagNo.trim()} data-testid="animal-save-new">
              Kaydet ve yeni ekle
            </Button>
          ) : null}
          <Button type="submit" disabled={busy || !form.tagNo.trim()} data-testid="animal-save">
            Kaydet
          </Button>
        </div>
      </div>
    </form>
  );
}
