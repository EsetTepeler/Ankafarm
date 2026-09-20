import { labels, type GroupKind } from "@anka/shared";
import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button, Dialog, FAB, HelperText, IconButton, List, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";

import { createGroup, deleteGroup, useGroups } from "@/features/groups/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";

const kinds = Object.entries(labels.groupKind) as [GroupKind, string][];

export default function GroupsScreen() {
  const groups = useGroups();
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GroupKind>("pen");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await createGroup({ name: name.trim(), kind });
      setOpen(false);
      setName("");
      setKind("pen");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={groups.data ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{groups.isLoading ? "Yükleniyor" : "Henüz grup yok. Sağ alttan ekleyin."}</Text>
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.name}
            description={`${labels.groupKind[item.kind as GroupKind] ?? item.kind}${item.capacity ? ` · kapasite ${item.capacity}` : ""}${item.syncSeq === 0 ? " · senkron bekliyor" : ""}`}
            left={(p) => <List.Icon {...p} icon={item.kind === "pasture" ? "grass" : item.kind === "quarantine" ? "medical-bag" : "barn"} />}
            right={(p) =>
              role === "owner" ? <IconButton {...p} icon="delete-outline" onPress={() => void deleteGroup(item.id)} /> : null
            }
          />
        )}
      />

      <FAB icon="plus" label="Grup ekle" style={styles.fab} onPress={() => setOpen(true)} testID="group-add" />

      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)}>
          <Dialog.Title>Yeni grup</Dialog.Title>
          <Dialog.Content style={styles.dialog}>
            <TextInput label="Ad" accessibilityLabel="Ad" testID="group-name" mode="outlined" value={name} onChangeText={setName} autoFocus />
            <SegmentedButtons
              value={kind}
              onValueChange={(v) => setKind(v as GroupKind)}
              buttons={kinds.map(([value, label]) => ({ value, label }))}
            />
            <HelperText type="error" visible={error !== null}>
              {error ?? ""}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Vazgeç</Button>
            <Button mode="contained" onPress={save} loading={busy} disabled={name.trim().length === 0 || busy} testID="group-save">
              Kaydet
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingBottom: 96 },
  empty: { textAlign: "center", opacity: 0.6, padding: 24 },
  fab: { position: "absolute", right: 16, bottom: 16 },
  dialog: { gap: 12 },
});
