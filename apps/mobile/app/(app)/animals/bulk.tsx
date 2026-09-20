import { labels, type HealthType } from "@anka/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button, Checkbox, Chip, Divider, HelperText, List, Snackbar, Text } from "react-native-paper";

import { HealthForm } from "@/components/HealthForm";
import { useAnimals } from "@/features/animals/repo";
import { useGroups } from "@/features/groups/repo";
import { addHealthBulk, emptyHealthForm, undoHealthBatch, type HealthFormValues } from "@/features/health/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";

/**
 * Toplu sağlık girişi: varsayılan seçim tüm aktif hayvanlar; grup çipiyle daraltılır, tek tek değiştirilir.
 * Kayıtlar ortak batch_id ile yazılır; kaydettikten sonra "Geri al" hepsini soft delete eder.
 */
export default function BulkHealthScreen() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const [groupId, setGroupId] = useState<string | undefined>();
  const animals = useAnimals({ status: "active", groupId });
  const groups = useGroups();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<HealthFormValues>(emptyHealthForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ batchId: string; count: number } | null>(null);

  const rows = animals.data ?? [];
  const selected = useMemo(() => rows.filter((a) => !excluded.has(a.id)), [rows, excluded]);
  const allSelected = excluded.size === 0;

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await addHealthBulk(
        selected.map((a) => a.id),
        form,
      );
      setDone(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!done) return;
    const n = await undoHealthBatch(done.batchId);
    setDone(null);
    setError(`${n} kayıt geri alındı`);
  }

  const typeLabel = labels.healthType[form.type as HealthType];

  return (
    <View style={styles.flex}>
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <HealthForm values={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
            <Divider style={styles.divider} />
            <Text variant="titleMedium">Kime uygulanacak?</Text>
            <View style={styles.chips}>
              <Chip selected={!groupId} onPress={() => setGroupId(undefined)} testID="bulk-group-all">
                Tüm gruplar
              </Chip>
              {(groups.data ?? []).map((g) => (
                <Chip key={g.id} selected={groupId === g.id} onPress={() => setGroupId(groupId === g.id ? undefined : g.id)}>
                  {g.name}
                </Chip>
              ))}
            </View>
            <View style={styles.rowBetween}>
              <Text variant="labelLarge" testID="bulk-count">
                {selected.length} / {rows.length} hayvan seçili
              </Text>
              <Button compact onPress={() => setExcluded(allSelected ? new Set(rows.map((a) => a.id)) : new Set())} testID="bulk-toggle-all">
                {allSelected ? "Hiçbirini seçme" : "Tümünü seç"}
              </Button>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.name ? `${item.tagNo} · ${item.name}` : item.tagNo}
            description={[labels.species[item.species as "sheep" | "goat"], item.groupName].filter(Boolean).join(" · ")}
            onPress={() => toggle(item.id)}
            left={() => <Checkbox status={excluded.has(item.id) ? "unchecked" : "checked"} onPress={() => toggle(item.id)} />}
            testID={`bulk-row-${item.tagNo}`}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{animals.isLoading ? "Yükleniyor" : "Bu seçimde aktif hayvan yok."}</Text>}
        ListFooterComponent={
          <View style={styles.footer}>
            <HelperText type="error" visible={error !== null}>
              {error ?? ""}
            </HelperText>
            <Button
              mode="contained"
              onPress={save}
              loading={busy}
              disabled={busy || selected.length === 0 || done !== null}
              icon="needle"
              testID="bulk-save"
            >
              {selected.length} hayvana {typeLabel.toLocaleLowerCase("tr")} kaydı ekle
            </Button>
          </View>
        }
      />

      <Snackbar
        visible={done !== null}
        onDismiss={() => {
          setDone(null);
          router.back();
        }}
        duration={8000}
        action={role === "owner" ? { label: "Geri al", onPress: () => void undo() } : undefined}
        testID="bulk-done"
      >
        {done ? `${done.count} hayvana ${typeLabel.toLocaleLowerCase("tr")} kaydı eklendi` : ""}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 48 },
  header: { padding: 16, gap: 8 },
  divider: { marginVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footer: { padding: 16, gap: 8 },
  empty: { textAlign: "center", opacity: 0.6, padding: 24 },
});
