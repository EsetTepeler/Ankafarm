import { labels, type BirthDifficulty, type BreedingMethod, type PregnancyResult, type Sex, type Species } from "@anka/shared";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Chip, Dialog, HelperText, IconButton, List, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { PickerDialog, type PickerItem } from "@/components/PickerDialog";
import { describeRelatedness, relatedness, type Relatedness } from "@/features/animals/pedigree";
import { useParentCandidates, type AnimalListItem } from "@/features/animals/repo";
import { addBreeding, breedingSummary, deleteBreeding, setPregnancyResult, useBreedings, type BreedingSummary } from "@/features/breeding/repo";
import { addLambing, useLambings, type NewLamb } from "@/features/lambing/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { isoToDisplay, todayIso } from "@/utils/date";

/** Profildeki Üreme sekmesi: çiftleşmeler, gebelik kontrolü, doğumlar. */
export function BreedingSection({ animal }: { animal: AnimalListItem }) {
  const role = useAuthStore((s) => s.user?.role);
  const breedings = useBreedings(animal.id);
  const lambings = useLambings(animal.id);
  const isFemale = animal.sex === "female";

  return (
    <Card>
      <Card.Content>
        {animal.isPregnant && animal.expectedBirthAt ? (
          <Text variant="titleSmall" style={styles.pregnant} testID="pregnancy-line">
            Gebe · beklenen doğum {isoToDisplay(animal.expectedBirthAt)}
          </Text>
        ) : null}
        <List.Subheader>Çiftleşmeler</List.Subheader>
        {(breedings.data ?? []).map((b) => (
          <List.Item
            key={b.id}
            title={`${isoToDisplay(b.matedAt)} · ${labels.breedingMethod[b.method as BreedingMethod] ?? b.method}`}
            description={
              isFemale
                ? `beklenen doğum ${isoToDisplay(b.expectedBirthAt)} · ${labels.pregnancyResult[b.pregnancyResult as PregnancyResult]}${b.pregnancyCheckedAt ? ` (${isoToDisplay(b.pregnancyCheckedAt)})` : ""}`
                : `beklenen doğum ${isoToDisplay(b.expectedBirthAt)}`
            }
            left={(p) => <List.Icon {...p} icon="heart-multiple-outline" />}
            right={(p) =>
              isFemale && b.pregnancyResult === "pending" ? (
                <View style={styles.row}>
                  <IconButton {...p} icon="check" accessibilityLabel="Gebe" onPress={() => void setPregnancyResult(b.id, b.femaleId, "positive", todayIso())} testID="pregnancy-positive" />
                  <IconButton {...p} icon="close" accessibilityLabel="Gebe değil" onPress={() => void setPregnancyResult(b.id, b.femaleId, "negative", todayIso())} testID="pregnancy-negative" />
                </View>
              ) : role === "owner" ? (
                <IconButton {...p} icon="delete-outline" onPress={() => void deleteBreeding(b.id, b.femaleId, "yanlış giriş")} />
              ) : null
            }
            testID="breeding-row"
          />
        ))}
        {breedings.data?.length === 0 ? <Text style={styles.muted}>Henüz çiftleşme kaydı yok.</Text> : null}

        {isFemale ? (
          <>
            <List.Subheader>Doğumlar</List.Subheader>
            {(lambings.data ?? []).map((l) => (
              <List.Item
                key={l.id}
                title={`${isoToDisplay(l.bornAt)} · ${l.liveCount} canlı${l.stillbornCount ? `, ${l.stillbornCount} ölü` : ""}`}
                description={[labels.birthDifficulty[l.difficulty as BirthDifficulty], l.notes].filter(Boolean).join(" · ")}
                left={(p) => <List.Icon {...p} icon="baby-face-outline" />}
                testID="lambing-row"
              />
            ))}
            {lambings.data?.length === 0 ? <Text style={styles.muted}>Henüz doğum kaydı yok.</Text> : null}
          </>
        ) : null}
      </Card.Content>
    </Card>
  );
}

/** Çiftleşme kaydı: dişi profilinden erkek seçilir; akrabalık ve geçmiş performans anında görünür. */
export function BreedingDialog({ visible, animal, onDismiss, onSaved }: { visible: boolean; animal: AnimalListItem; onDismiss: () => void; onSaved: () => void }) {
  const isFemale = animal.sex === "female";
  const partners = useParentCandidates(animal.species as Species, isFemale ? "male" : "female", animal.id);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [method, setMethod] = useState<BreedingMethod>("natural");
  const [date, setDate] = useState<string | null>(todayIso());
  const [notes, setNotes] = useState("");
  const [rel, setRel] = useState<Relatedness | null>(null);
  const [ownSummary, setOwnSummary] = useState<BreedingSummary | null>(null);
  const [partnerSummary, setPartnerSummary] = useState<BreedingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items: PickerItem[] = useMemo(() => (partners.data ?? []).map((p) => ({ id: p.id, label: p.tagNo, description: p.name ?? undefined })), [partners.data]);
  const partnerLabel = items.find((i) => i.id === partnerId)?.label ?? "";

  useEffect(() => {
    if (!visible) return;
    void breedingSummary(animal.id).then(setOwnSummary);
  }, [visible, animal.id]);

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
    setError(null);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const femaleId = isFemale ? animal.id : partnerId;
      const maleId = isFemale ? partnerId : animal.id;
      if (!femaleId) throw new Error("Dişi seçilmeli");
      await addBreeding({ femaleId, maleId, method, matedAt: date, notes: notes.trim() || null, species: animal.species as Species });
      onSaved();
      setPartnerId(null);
      setNotes("");
      onDismiss();
    } catch (err) {
      setError(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const summaryText = (s: BreedingSummary | null, sex: Sex) =>
    !s ? "" : sex === "female" ? `${s.births} doğum · ${s.liveLambs} canlı yavru${s.stillborn ? ` · ${s.stillborn} ölü doğum` : ""}` : `${s.sired} yavrunun babası`;

  return (
    <>
      <Portal>
        <Dialog visible={visible && !picker} onDismiss={onDismiss} style={styles.tallDialog}>
          <Dialog.Title>Çiftleşme</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogScroll} keyboardShouldPersistTaps="handled">
              <List.Item
                title={isFemale ? "Koç" : "Koyun"}
                description={partnerLabel || "Seçilmedi (bilinmiyor da olabilir)"}
                onPress={() => setPicker(true)}
                left={(p) => <List.Icon {...p} icon={isFemale ? "gender-male" : "gender-female"} />}
                right={(p) => <List.Icon {...p} icon="chevron-right" />}
                testID="breeding-partner"
              />
              {relText ? (
                <Chip
                  icon={relText.level === "none" ? "check" : "alert"}
                  style={relText.level === "danger" ? styles.danger : relText.level === "warn" ? styles.warn : undefined}
                  testID="relatedness"
                >
                  {relText.text}
                </Chip>
              ) : null}
              <View style={styles.summaryBox}>
                <Text variant="labelMedium">Geçmiş performans</Text>
                <Text variant="bodySmall" testID="summary-own">
                  {animal.tagNo}: {summaryText(ownSummary, animal.sex as Sex) || "kayıt yok"}
                </Text>
                {partnerId ? (
                  <Text variant="bodySmall" testID="summary-partner">
                    {partnerLabel}: {summaryText(partnerSummary, isFemale ? "male" : "female") || "kayıt yok"}
                  </Text>
                ) : null}
              </View>
              <SegmentedButtons
                value={method}
                onValueChange={(v) => setMethod(v as BreedingMethod)}
                buttons={[
                  { value: "natural", label: labels.breedingMethod.natural },
                  { value: "ai", label: labels.breedingMethod.ai },
                ]}
              />
              <DateField label="Çiftleşme tarihi" value={date} onChange={setDate} testID="breeding-date" />
              <TextInput label="Not" mode="outlined" value={notes} onChangeText={setNotes} />
              <HelperText type="error" visible={error !== null}>
                {error ?? ""}
              </HelperText>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={onDismiss}>Vazgeç</Button>
            <Button mode="contained" onPress={save} loading={busy} disabled={busy || (!isFemale && !partnerId)} testID="breeding-save">
              Kaydet
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <PickerDialog
        visible={picker}
        title={isFemale ? "Koç seç" : "Koyun seç"}
        items={items}
        selectedId={partnerId}
        onSelect={setPartnerId}
        onDismiss={() => setPicker(false)}
        noneLabel="Bilinmiyor"
        testID="picker-partner"
      />
    </>
  );
}

/** Doğum kaydı: her canlı yavru için küpe ve cinsiyet; yavrular otomatik hayvan olur. */
export function LambingDialog({ visible, animal, onDismiss, onSaved }: { visible: boolean; animal: AnimalListItem; onDismiss: () => void; onSaved: (lambIds: string[]) => void }) {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(todayIso());
  const [difficulty, setDifficulty] = useState<BirthDifficulty>("easy");
  const [stillborn, setStillborn] = useState("0");
  const [lambs, setLambs] = useState<NewLamb[]>([{ tagNo: "", sex: "female" }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setLamb(i: number, patch: Partial<NewLamb>) {
    setLambs((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!date) throw new Error("Doğum tarihi gerekli");
      const live = lambs.filter((l) => l.tagNo.trim());
      const still = Number(stillborn) || 0;
      if (live.length === 0 && still === 0) throw new Error("En az bir canlı yavru küpesi veya ölü doğum sayısı girin");
      const result = await addLambing({ motherId: animal.id, bornAt: date, difficulty, stillbornCount: still, lambs: live, notes: notes.trim() || null });
      onSaved(result.lambIds);
      setLambs([{ tagNo: "", sex: "female" }]);
      setNotes("");
      onDismiss();
      if (result.lambIds.length === 1) router.push({ pathname: "/(app)/animals/[id]", params: { id: result.lambIds[0]! } });
    } catch (err) {
      setError(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.tallDialog}>
        <Dialog.Title>Doğum</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.dialogScroll} keyboardShouldPersistTaps="handled">
            <DateField label="Doğum tarihi" value={date} onChange={setDate} testID="lambing-date" />
            <Text variant="labelLarge">Doğum zorluğu</Text>
            <SegmentedButtons
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as BirthDifficulty)}
              buttons={(Object.entries(labels.birthDifficulty) as [BirthDifficulty, string][]).map(([value, label]) => ({ value, label }))}
            />
            <Text variant="labelLarge">Canlı yavrular</Text>
            {lambs.map((l, i) => (
              <View key={i} style={styles.row}>
                <TextInput
                  label={`Yavru ${i + 1} küpe`}
                  mode="outlined"
                  value={l.tagNo}
                  onChangeText={(v) => setLamb(i, { tagNo: v })}
                  autoCapitalize="characters"
                  style={styles.flex}
                  testID={`lamb-tag-${i}`}
                />
                <SegmentedButtons
                  value={l.sex}
                  onValueChange={(v) => setLamb(i, { sex: v as Sex })}
                  density="small"
                  buttons={[
                    { value: "female", label: "Dişi", testID: `lamb-female-${i}` },
                    { value: "male", label: "Erkek", testID: `lamb-male-${i}` },
                  ]}
                />
                {lambs.length > 1 ? <IconButton icon="close" onPress={() => setLambs((p) => p.filter((_, j) => j !== i))} /> : null}
              </View>
            ))}
            <Button icon="plus" onPress={() => setLambs((p) => [...p, { tagNo: "", sex: "female" }])} disabled={lambs.length >= 6} testID="lamb-add">
              Yavru ekle
            </Button>
            <TextInput label="Ölü doğum sayısı" mode="outlined" value={stillborn} onChangeText={setStillborn} keyboardType="number-pad" testID="lambing-stillborn" />
            <TextInput label="Not" mode="outlined" value={notes} onChangeText={setNotes} />
            <HelperText type="error" visible={error !== null}>
              {error ?? ""}
            </HelperText>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Vazgeç</Button>
          <Button mode="contained" onPress={save} loading={busy} disabled={busy} testID="lambing-save">
            Kaydet
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  muted: { opacity: 0.7 },
  pregnant: { marginBottom: 8 },
  tallDialog: { maxHeight: "90%" },
  dialogScroll: { paddingVertical: 8, gap: 8 },
  summaryBox: { gap: 2, paddingVertical: 4 },
  warn: { backgroundColor: "#FBE380" },
  danger: { backgroundColor: "#F2B8B5" },
});
