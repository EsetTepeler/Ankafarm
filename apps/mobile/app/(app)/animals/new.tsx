import { DEFAULT_GROUP_NAME, labels, type BirthType, type Origin, type Sex, type Species } from "@anka/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Button, Divider, HelperText, List, SegmentedButtons, Snackbar, Switch, Text, TextInput } from "react-native-paper";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { PickerDialog, type PickerItem } from "@/components/PickerDialog";
import { createAnimal, DuplicateTagError, updateAnimal, useAnimal, useParentCandidates } from "@/features/animals/repo";
import { createBreed, useBreeds } from "@/features/breeds/repo";
import { useGroups } from "@/features/groups/repo";
import { errorMessage } from "@/lib/auth";
import { todayIso } from "@/utils/date";

type Picker = "breed" | "mother" | "father" | "group" | null;

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
}

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

export default function AnimalFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const existing = useAnimal(id);

  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Picker>(null);
  const [newBreedName, setNewBreedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const breeds = useBreeds(form.species);
  const groups = useGroups();
  const mothers = useParentCandidates(form.species, "female", id);
  const fathers = useParentCandidates(form.species, "male", id);

  // Düzenleme: kayıt gelince formu bir kez doldur.
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

  // Yeni kayıtta varsayılan grup "Ana sürü".
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
  const motherItems: PickerItem[] = useMemo(
    () => (mothers.data ?? []).map((m) => ({ id: m.id, label: m.tagNo, description: m.name ?? undefined })),
    [mothers.data],
  );
  const fatherItems: PickerItem[] = useMemo(
    () => (fathers.data ?? []).map((m) => ({ id: m.id, label: m.tagNo, description: m.name ?? undefined })),
    [fathers.data],
  );
  const labelOf = (items: PickerItem[], selected: string | null) => items.find((i) => i.id === selected)?.label ?? "";
  const breedIsCross = labelOf(breedItems, form.breedId) === "Melez";

  function selectMother(motherId: string | null) {
    set("motherId", motherId);
    // Irk anneden gelir, sonradan değiştirilebilir.
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
        setToast("Kaydedildi");
        router.back();
        return;
      }
      const newId = await createAnimal(input);
      if (andNew) {
        setForm((f) => ({ ...empty, origin: f.origin, species: f.species, sex: f.sex, groupId: f.groupId, acquiredAt: f.acquiredAt, source: f.source }));
        setToast(`${input.tagNo.toUpperCase()} kaydedildi, sıradaki`);
      } else {
        router.replace({ pathname: "/(app)/animals/[id]", params: { id: newId } });
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
        if (first) setToast(`${fieldLabels[first[0]] ?? first[0]}: ${first[1]}`);
      } else if (err instanceof DuplicateTagError) {
        setErrors({ tagNo: err.message });
        setToast(err.message);
      } else {
        setToast(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function addBreed() {
    const name = newBreedName?.trim();
    if (!name) return;
    try {
      const breedId = await createBreed({ name, species: form.species });
      set("breedId", breedId);
      setNewBreedName(null);
    } catch (err) {
      setToast(errorMessage(err));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: editing ? "Hayvanı düzenle" : "Hayvan ekle" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text variant="labelLarge">Nereden geldi?</Text>
        <SegmentedButtons
          value={form.origin}
          onValueChange={(v) => set("origin", v as Origin)}
          buttons={[
            { value: "born_here", label: labels.origin.born_here, icon: "home-heart", testID: "origin-born" },
            { value: "purchased", label: labels.origin.purchased, icon: "truck-outline", testID: "origin-purchased" },
          ]}
        />

        <View style={styles.row}>
          <SegmentedButtons
            style={styles.flex}
            value={form.species}
            onValueChange={(v) => set("species", v as Species)}
            buttons={[
              { value: "sheep", label: "Koyun" },
              { value: "goat", label: "Keçi" },
            ]}
          />
        </View>
        <SegmentedButtons
          value={form.sex}
          onValueChange={(v) => set("sex", v as Sex)}
          buttons={[
            { value: "female", label: "Dişi", testID: "sex-female" },
            { value: "male", label: "Erkek", testID: "sex-male" },
            { value: "castrated", label: "Kısır" },
          ]}
        />

        <TextInput
          label="Küpe numarası"
          accessibilityLabel="Küpe numarası"
          testID="animal-tag"
          mode="outlined"
          value={form.tagNo}
          onChangeText={(v) => set("tagNo", v)}
          autoCapitalize="characters"
          autoCorrect={false}
          error={!!errors.tagNo}
        />
        <HelperText type="error" visible={!!errors.tagNo}>
          {errors.tagNo ?? ""}
        </HelperText>

        <TextInput label="İsim (isteğe bağlı)" testID="animal-name" mode="outlined" value={form.name} onChangeText={(v) => set("name", v)} />

        <Divider style={styles.divider} />

        {form.origin === "born_here" ? (
          <>
            <List.Item
              title="Anne"
              description={labelOf(motherItems, form.motherId) || "Seçilmedi"}
              onPress={() => setPicker("mother")}
              testID="animal-mother"
              left={(p) => <List.Icon {...p} icon="gender-female" />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
            />
            <HelperText type="error" visible={!!errors.motherId}>
              {errors.motherId ?? ""}
            </HelperText>
            <List.Item
              title="Baba (isteğe bağlı)"
              description={labelOf(fatherItems, form.fatherId) || "Seçilmedi"}
              onPress={() => setPicker("father")}
              testID="animal-father"
              left={(p) => <List.Icon {...p} icon="gender-male" />}
              right={(p) => <List.Icon {...p} icon="chevron-right" />}
            />
            <DateField label="Doğum tarihi" value={form.birthDate} onChange={(v) => set("birthDate", v)} testID="animal-birthdate" error={errors.birthDate} />
            <Text variant="labelLarge">Doğum tipi</Text>
            <SegmentedButtons
              value={form.birthType ?? ""}
              onValueChange={(v) => set("birthType", (v || null) as BirthType | null)}
              buttons={(Object.entries(labels.birthType) as [BirthType, string][]).map(([value, label]) => ({ value, label }))}
            />
          </>
        ) : (
          <>
            <DateField label="Alınma tarihi" value={form.acquiredAt} onChange={(v) => set("acquiredAt", v)} testID="animal-acquired" error={errors.acquiredAt} />
            <TextInput label="Satıcı (isteğe bağlı)" mode="outlined" value={form.source} onChangeText={(v) => set("source", v)} />
            <TextInput
              label="Fiyat, TL (isteğe bağlı)"
              mode="outlined"
              value={form.purchasePrice}
              onChangeText={(v) => set("purchasePrice", v)}
              keyboardType="decimal-pad"
              error={!!errors.purchasePrice}
            />
            <HelperText type="error" visible={!!errors.purchasePrice}>
              {errors.purchasePrice ?? ""}
            </HelperText>
            <DateField label="Doğum tarihi (biliniyorsa)" value={form.birthDate} onChange={(v) => set("birthDate", v)} testID="animal-birthdate" />
            <List.Item
              title="Doğum tarihi tahmini"
              right={() => <Switch value={form.birthDateEstimated} onValueChange={(v) => set("birthDateEstimated", v)} />}
            />
          </>
        )}

        <List.Item
          title="Irk"
          description={labelOf(breedItems, form.breedId) || (form.origin === "purchased" ? "Seçilmeli" : "Anneden gelir, isteğe bağlı")}
          onPress={() => setPicker("breed")}
          testID="animal-breed"
          left={(p) => <List.Icon {...p} icon="dna" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
        />
        <HelperText type="error" visible={!!errors.breedId}>
          {errors.breedId ?? ""}
        </HelperText>
        {breedIsCross ? (
          <TextInput label="Melez açıklaması" mode="outlined" value={form.breedNote} onChangeText={(v) => set("breedNote", v)} placeholder="İle de France x Kıvırcık" />
        ) : null}

        <List.Item
          title="Grup"
          description={labelOf(groupItems, form.groupId) || "Seçilmedi"}
          onPress={() => setPicker("group")}
          testID="animal-group"
          left={(p) => <List.Icon {...p} icon="view-grid-outline" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
        />

        <TextInput label="Not" mode="outlined" value={form.notes} onChangeText={(v) => set("notes", v)} multiline numberOfLines={3} />

        <View style={styles.actions}>
          <Button mode="contained" onPress={() => save(false)} loading={busy} disabled={busy || !form.tagNo.trim()} testID="animal-save">
            Kaydet
          </Button>
          {!editing ? (
            <Button mode="contained-tonal" onPress={() => save(true)} disabled={busy || !form.tagNo.trim()} testID="animal-save-new">
              Kaydet ve yeni ekle
            </Button>
          ) : null}
        </View>
      </ScrollView>

      <PickerDialog
        visible={picker === "breed"}
        title="Irk"
        items={breedItems}
        selectedId={form.breedId}
        onSelect={(v) => set("breedId", v)}
        onDismiss={() => setPicker(null)}
        noneLabel="Irk yok"
        extraAction={{ label: "Yeni ırk ekle", onPress: () => { setPicker(null); setNewBreedName(""); } }}
        testID="picker-breed"
      />
      <PickerDialog visible={picker === "mother"} title="Anne" items={motherItems} selectedId={form.motherId} onSelect={selectMother} onDismiss={() => setPicker(null)} noneLabel="Anne yok" testID="picker-mother" />
      <PickerDialog visible={picker === "father"} title="Baba" items={fatherItems} selectedId={form.fatherId} onSelect={(v) => set("fatherId", v)} onDismiss={() => setPicker(null)} noneLabel="Baba yok" testID="picker-father" />
      <PickerDialog visible={picker === "group"} title="Grup" items={groupItems} selectedId={form.groupId} onSelect={(v) => set("groupId", v)} onDismiss={() => setPicker(null)} noneLabel="Grup yok" searchable={false} testID="picker-group" />

      {newBreedName !== null ? (
        <View style={styles.newBreed}>
          <TextInput label={`Yeni ${labels.species[form.species].toLocaleLowerCase("tr")} ırkı`} mode="outlined" value={newBreedName} onChangeText={setNewBreedName} autoFocus />
          <View style={styles.row}>
            <Button onPress={() => setNewBreedName(null)}>Vazgeç</Button>
            <Button mode="contained" onPress={addBreed} disabled={!newBreedName.trim()}>
              Ekle
            </Button>
          </View>
        </View>
      ) : null}

      <Snackbar visible={toast !== null} onDismiss={() => setToast(null)} duration={3000}>
        {toast ?? ""}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 10, paddingBottom: 48 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  divider: { marginVertical: 8 },
  actions: { gap: 8, marginTop: 8 },
  newBreed: { padding: 16, gap: 8 },
});
