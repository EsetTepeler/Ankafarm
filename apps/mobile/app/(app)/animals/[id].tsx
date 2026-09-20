import { formatKg, labels, type AnimalEvent, type AnimalStatus, type BirthType, type Origin, type Sex, type Species } from "@anka/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Chip, Dialog, FAB, HelperText, IconButton, List, Portal, SegmentedButtons, Snackbar, Text, TextInput } from "react-native-paper";
import { ZodError } from "zod";

import { LineChart } from "@/charts/LineChart";
import { DateField } from "@/components/DateField";
import { HealthForm } from "@/components/HealthForm";
import { PedigreeSection } from "@/features/animals/PedigreeSection";
import { useAnimal } from "@/features/animals/repo";
import { BreedingDialog, BreedingSection, LambingDialog } from "@/features/breeding/BreedingSection";
import { useTimeline } from "@/features/animals/timeline";
import { addHealth, deleteHealth, emptyHealthForm, healthStatus, useHealth, type HealthFormValues } from "@/features/health/repo";
import { addWeight, deleteWeight, useWeights } from "@/features/weights/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { formatAge, formatDate, formatDateTime, isoToDisplay, todayIso } from "@/utils/date";

type Tab = "summary" | "timeline" | "health" | "weight" | "breeding" | "pedigree";

const eventIcon: Record<AnimalEvent["type"], string> = {
  created: "star-outline",
  weight: "scale",
  group_move: "swap-horizontal",
  health: "needle",
  breeding: "heart-multiple-outline",
  lambing: "baby-face-outline",
};

export default function AnimalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const animal = useAnimal(id);
  const timeline = useTimeline(id);
  const weights = useWeights(id);
  const health = useHealth(id);
  const [tab, setTab] = useState<Tab>("summary");
  const [fabOpen, setFabOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [breedingOpen, setBreedingOpen] = useState(false);
  const [lambingOpen, setLambingOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const a = animal.data;

  if (!a) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.muted}>{animal.isLoading ? "Yükleniyor" : "Hayvan bulunamadı"}</Text>
      </ScrollView>
    );
  }

  const title = a.name ? `${a.tagNo} · ${a.name}` : a.tagNo;
  const weightRows = weights.data ?? [];
  const trend = weightRows.length >= 2 ? weightRows[0]!.weightKg - weightRows[1]!.weightKg : null;
  const hs = healthStatus(health.data ?? []);
  const healthBadge = hs.withdrawalUntil
    ? `Arınma ${isoToDisplay(hs.withdrawalUntil)}'e kadar`
    : hs.overdueCount > 0
      ? `${hs.overdueCount} doz gecikmiş`
      : hs.nextDueAt
        ? `Sonraki doz ${isoToDisplay(hs.nextDueAt)}`
        : (health.data?.length ?? 0) > 0
          ? "Sağlık: sorun yok"
          : "Sağlık kaydı yok";
  const healthIcon = hs.withdrawalUntil ? "alert-octagon-outline" : hs.overdueCount > 0 ? "alert-outline" : "heart-outline";
  const weightBadge =
    a.currentWeight == null ? "Tartım yok" : trend == null ? formatKg(a.currentWeight) : `${formatKg(a.currentWeight)} ${trend > 0 ? "↑" : trend < 0 ? "↓" : "→"}`;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Card.Title
            title={title}
            subtitle={[labels.species[a.species as Species], labels.sex[a.sex as Sex], a.breedName, formatAge(a.birthDate)].filter(Boolean).join(" · ")}
          />
          <Card.Content>
            <View style={styles.badges}>
              <Chip compact icon="scale" testID="badge-weight">
                {weightBadge}
              </Chip>
              <Chip compact icon={healthIcon} testID="badge-health">
                {healthBadge}
              </Chip>
              {a.isPregnant && a.expectedBirthAt ? (
                <Chip compact icon="baby-carriage" testID="badge-pregnant">
                  Gebe · {isoToDisplay(a.expectedBirthAt)}
                </Chip>
              ) : null}
              <Chip compact icon="view-grid-outline">
                {a.groupName ?? "Grup yok"}
              </Chip>
              <Chip compact icon={a.status === "active" ? "check-circle-outline" : "archive-outline"}>
                {labels.animalStatus[a.status as AnimalStatus]}
              </Chip>
              {a.syncSeq === 0 ? (
                <Chip compact icon="cloud-upload-outline">
                  Senkron bekliyor
                </Chip>
              ) : null}
            </View>
          </Card.Content>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            buttons={[
              { value: "summary", label: "Özet", testID: "tab-summary" },
              { value: "timeline", label: "Olaylar", testID: "tab-timeline" },
              { value: "health", label: "Sağlık", testID: "tab-health" },
              { value: "weight", label: "Kilo", testID: "tab-weight" },
              { value: "breeding", label: "Üreme", testID: "tab-breeding" },
              { value: "pedigree", label: "Soy ağacı", testID: "tab-pedigree" },
            ]}
          />
        </ScrollView>

        {tab === "summary" ? (
          <Card>
            <Card.Content>
              <List.Item
                title="Doğum"
                description={
                  a.birthDate
                    ? `${isoToDisplay(a.birthDate)}${a.birthDateEstimated ? " (tahmini)" : ""}${a.birthType ? ` · ${labels.birthType[a.birthType as BirthType]}` : ""}`
                    : "Bilinmiyor"
                }
                left={(p) => <List.Icon {...p} icon="calendar" />}
              />
              <List.Item
                title="Köken"
                description={
                  a.origin === "purchased"
                    ? `${labels.origin[a.origin as Origin]}${a.acquiredAt ? ` · ${isoToDisplay(a.acquiredAt)}` : ""}${a.source ? ` · ${a.source}` : ""}${a.purchasePrice != null ? ` · ${a.purchasePrice} TL` : ""}`
                    : labels.origin[a.origin as Origin]
                }
                left={(p) => <List.Icon {...p} icon="map-marker-outline" />}
              />
              {a.breedNote ? <List.Item title="Irk notu" description={a.breedNote} left={(p) => <List.Icon {...p} icon="dna" />} /> : null}
              {a.notes ? <List.Item title="Not" description={a.notes} left={(p) => <List.Icon {...p} icon="note-text-outline" />} /> : null}
            </Card.Content>
            <Card.Actions>
              <Button icon="pencil" onPress={() => router.push({ pathname: "/(app)/animals/new", params: { id: a.id } })} testID="animal-edit">
                Düzenle
              </Button>
            </Card.Actions>
          </Card>
        ) : null}

        {tab === "timeline" ? (
          <Card>
            <Card.Content>
              {(timeline.data ?? []).map((ev) => (
                <List.Item
                  key={ev.id}
                  title={ev.title}
                  description={[ev.summary, formatDateTime(ev.occurredAt)].filter(Boolean).join(" · ")}
                  left={(p) => <List.Icon {...p} icon={eventIcon[ev.type]} />}
                  testID={`timeline-${ev.type}`}
                />
              ))}
              {timeline.data?.length === 0 ? <Text style={styles.muted}>Henüz olay yok.</Text> : null}
            </Card.Content>
          </Card>
        ) : null}

        {tab === "health" ? (
          <Card>
            <Card.Content>
              {(health.data ?? []).map((h) => (
                <List.Item
                  key={h.id}
                  title={[labels.healthType[h.type as keyof typeof labels.healthType], h.productName].filter(Boolean).join(" · ")}
                  description={[
                    formatDate(h.appliedAt),
                    h.dose != null ? `${h.dose} ${h.doseUnit ?? ""}`.trim() : null,
                    h.vetName ? `Vet. ${h.vetName}` : null,
                    h.nextDueAt ? `sonraki ${isoToDisplay(h.nextDueAt)}` : null,
                    h.withdrawalUntil ? `arınma bitişi ${isoToDisplay(h.withdrawalUntil)}` : null,
                    h.batchId ? "toplu" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  left={(p) => <List.Icon {...p} icon="needle" />}
                  right={(p) => (role === "owner" ? <IconButton {...p} icon="delete-outline" onPress={() => void deleteHealth(h.id, "yanlış giriş")} /> : null)}
                  testID={`health-row-${h.type}`}
                />
              ))}
              {health.data?.length === 0 ? <Text style={styles.muted}>Henüz sağlık kaydı yok.</Text> : null}
            </Card.Content>
          </Card>
        ) : null}

        {tab === "breeding" ? <BreedingSection animal={a} /> : null}
        {tab === "pedigree" ? <PedigreeSection animalId={a.id} /> : null}

        {tab === "weight" ? (
          <Card>
            <Card.Content>
              <LineChart points={weightRows.map((w) => ({ x: new Date(w.weighedAt).getTime(), y: w.weightKg }))} unit=" kg" emptyText="Grafik için en az iki tartım gerekli" />
              {weightRows.map((w) => (
                <List.Item
                  key={w.id}
                  title={formatKg(w.weightKg)}
                  description={[formatDate(w.weighedAt), w.note].filter(Boolean).join(" · ")}
                  left={(p) => <List.Icon {...p} icon="scale" />}
                  right={(p) => (role === "owner" ? <IconButton {...p} icon="delete-outline" onPress={() => void deleteWeight(w.id, a.id, "yanlış giriş")} /> : null)}
                />
              ))}
              {weightRows.length === 0 ? <Text style={styles.muted}>Henüz tartım yok.</Text> : null}
            </Card.Content>
          </Card>
        ) : null}
      </ScrollView>

      <FAB icon="plus" label="Olay ekle" style={styles.fab} onPress={() => setFabOpen(true)} testID="event-add" />
      <Portal>
        <Dialog visible={fabOpen} onDismiss={() => setFabOpen(false)}>
          <Dialog.Title>Olay ekle</Dialog.Title>
          <Dialog.Content style={styles.dialogList}>
            <List.Item title="Tartım" left={(p) => <List.Icon {...p} icon="scale" />} onPress={() => { setFabOpen(false); setWeightOpen(true); }} testID="event-weight" />
            <List.Item title="Aşı, ilaç veya bakım" left={(p) => <List.Icon {...p} icon="needle" />} onPress={() => { setFabOpen(false); setHealthOpen(true); }} testID="event-health" />
            <List.Item title="Çiftleşme" left={(p) => <List.Icon {...p} icon="heart-multiple-outline" />} onPress={() => { setFabOpen(false); setBreedingOpen(true); }} testID="event-breeding" />
            {a.sex === "female" ? (
              <List.Item title="Doğum" left={(p) => <List.Icon {...p} icon="baby-face-outline" />} onPress={() => { setFabOpen(false); setLambingOpen(true); }} testID="event-lambing" />
            ) : null}
            <List.Item title="Gözlem" description="1.13 ile gelecek" left={(p) => <List.Icon {...p} icon="eye-outline" />} onPress={() => { setFabOpen(false); setToast("Gözlem 1.13 ile gelecek"); }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setFabOpen(false)}>Kapat</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <WeightDialog visible={weightOpen} animalId={a.id} onDismiss={() => setWeightOpen(false)} onSaved={(kg) => setToast(`${formatKg(kg)} kaydedildi`)} />
      <HealthDialog visible={healthOpen} animalId={a.id} onDismiss={() => setHealthOpen(false)} onSaved={(label) => setToast(`${label} kaydedildi`)} />
      <BreedingDialog visible={breedingOpen} animal={a} onDismiss={() => setBreedingOpen(false)} onSaved={() => { setToast("Çiftleşme kaydedildi"); setTab("breeding"); }} />
      {a.sex === "female" ? (
        <LambingDialog visible={lambingOpen} animal={a} onDismiss={() => setLambingOpen(false)} onSaved={(ids) => setToast(`Doğum kaydedildi, ${ids.length} yavru açıldı`)} />
      ) : null}

      <Snackbar visible={toast !== null} onDismiss={() => setToast(null)} duration={2500}>
        {toast ?? ""}
      </Snackbar>
    </View>
  );
}

function WeightDialog({ visible, animalId, onDismiss, onSaved }: { visible: boolean; animalId: string; onDismiss: () => void; onSaved: (kg: number) => void }) {
  const [kg, setKg] = useState("");
  const [date, setDate] = useState<string | null>(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const value = Number(kg.trim().replace(",", "."));
      if (!kg.trim() || Number.isNaN(value)) throw new Error("Kilo sayı olmalı");
      if (!date) throw new Error("Tarih gerekli");
      const weighedAt = new Date(`${date}T12:00:00`).toISOString();
      await addWeight({ animalId, weightKg: value, weighedAt, note: note.trim() || null });
      onSaved(value);
      setKg("");
      setNote("");
      setDate(todayIso());
      onDismiss();
    } catch (err) {
      setError(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Tartım</Dialog.Title>
        <Dialog.Content style={styles.dialog}>
          <TextInput label="Kilo (kg)" accessibilityLabel="Kilo" testID="weight-kg" mode="outlined" value={kg} onChangeText={setKg} keyboardType="decimal-pad" autoFocus />
          <DateField label="Tarih" value={date} onChange={setDate} testID="weight-date" />
          <TextInput label="Not (isteğe bağlı)" mode="outlined" value={note} onChangeText={setNote} />
          <HelperText type="error" visible={error !== null}>
            {error ?? ""}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Vazgeç</Button>
          <Button mode="contained" onPress={save} loading={busy} disabled={busy || !kg.trim()} testID="weight-save">
            Kaydet
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function HealthDialog({ visible, animalId, onDismiss, onSaved }: { visible: boolean; animalId: string; onDismiss: () => void; onSaved: (label: string) => void }) {
  const [form, setForm] = useState<HealthFormValues>(emptyHealthForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await addHealth(animalId, form);
      onSaved(labels.healthType[form.type]);
      setForm(emptyHealthForm);
      onDismiss();
    } catch (err) {
      setError(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.tallDialog}>
        <Dialog.Title>Sağlık kaydı</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.dialogScroll} keyboardShouldPersistTaps="handled">
            <HealthForm values={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
            <HelperText type="error" visible={error !== null}>
              {error ?? ""}
            </HelperText>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Vazgeç</Button>
          <Button mode="contained" onPress={save} loading={busy} disabled={busy} testID="health-save">
            Kaydet
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tallDialog: { maxHeight: "90%" },
  dialogScroll: { paddingVertical: 8 },
  container: { padding: 16, gap: 12, paddingBottom: 96 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fab: { position: "absolute", right: 16, bottom: 16 },
  muted: { opacity: 0.7 },
  dialog: { gap: 8 },
  dialogList: { paddingHorizontal: 0 },
});
