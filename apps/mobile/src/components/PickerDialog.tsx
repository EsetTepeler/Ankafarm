import { useMemo, useState } from "react";
import { FlatList, StyleSheet } from "react-native";
import { Button, Dialog, List, Portal, Searchbar, Text } from "react-native-paper";

export interface PickerItem {
  id: string;
  label: string;
  description?: string;
}

interface Props {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDismiss: () => void;
  /** "Yok" seçeneği için etiket; verilmezse boş seçim yapılamaz. */
  noneLabel?: string;
  /** Alt kısımda ek işlem, örneğin "Yeni ırk ekle". */
  extraAction?: { label: string; onPress: () => void };
  searchable?: boolean;
  testID?: string;
}

/** Aranabilir seçim listesi; ırk, anne, baba, grup gibi seçimler için. */
export function PickerDialog({ visible, title, items, selectedId, onSelect, onDismiss, noneLabel, extraAction, searchable = true, testID }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return items;
    return items.filter((i) => i.label.toLocaleLowerCase("tr").includes(q) || i.description?.toLocaleLowerCase("tr").includes(q));
  }, [items, query]);

  function choose(id: string | null) {
    onSelect(id);
    setQuery("");
    onDismiss();
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog} testID={testID}>
        <Dialog.Title>{title}</Dialog.Title>
        {searchable ? (
          <Dialog.Content>
            <Searchbar placeholder="Ara" value={query} onChangeText={setQuery} autoFocus />
          </Dialog.Content>
        ) : null}
        <Dialog.ScrollArea style={styles.scroll}>
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              noneLabel ? (
                <List.Item title={noneLabel} onPress={() => choose(null)} left={(p) => <List.Icon {...p} icon={selectedId === null ? "radiobox-marked" : "radiobox-blank"} />} />
              ) : null
            }
            ListEmptyComponent={<Text style={styles.empty}>Sonuç yok</Text>}
            renderItem={({ item }) => (
              <List.Item
                title={item.label}
                description={item.description}
                onPress={() => choose(item.id)}
                testID={`picker-item-${item.id}`}
                left={(p) => <List.Icon {...p} icon={item.id === selectedId ? "radiobox-marked" : "radiobox-blank"} />}
              />
            )}
          />
        </Dialog.ScrollArea>
        <Dialog.Actions>
          {extraAction ? <Button onPress={extraAction.onPress}>{extraAction.label}</Button> : null}
          <Button onPress={onDismiss}>Kapat</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: "85%" },
  scroll: { paddingHorizontal: 0, maxHeight: 400 },
  empty: { textAlign: "center", opacity: 0.6, padding: 16 },
});
