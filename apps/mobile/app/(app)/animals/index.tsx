import { formatKg, labels, type Sex, type Species } from "@anka/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { Chip, FAB, IconButton, List, Searchbar, Text } from "react-native-paper";

import { useAnimals, type AnimalListItem } from "@/features/animals/repo";
import { formatAge } from "@/utils/date";

function describe(a: AnimalListItem): string {
  return [
    labels.species[a.species as Species],
    labels.sex[a.sex as Sex],
    a.breedName,
    a.groupName,
    formatAge(a.birthDate),
    a.currentWeight != null ? formatKg(a.currentWeight) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function AnimalsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [species, setSpecies] = useState<Species | undefined>();
  const [sex, setSex] = useState<Sex | undefined>();
  const list = useAnimals({ search, status, species, sex });
  const rows = list.data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <Searchbar placeholder="Küpe no veya isim" value={search} onChangeText={setSearch} testID="animal-search" style={styles.flex} />
          <IconButton icon="needle" mode="contained-tonal" onPress={() => router.push("/(app)/animals/bulk")} accessibilityLabel="Toplu sağlık girişi" testID="bulk-health" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip selected={species === "sheep"} onPress={() => setSpecies(species === "sheep" ? undefined : "sheep")} icon="sheep">
            Koyun
          </Chip>
          <Chip selected={species === "goat"} onPress={() => setSpecies(species === "goat" ? undefined : "goat")} icon="sheep">
            Keçi
          </Chip>
          <Chip selected={sex === "female"} onPress={() => setSex(sex === "female" ? undefined : "female")} icon="gender-female">
            Dişi
          </Chip>
          <Chip selected={sex === "male"} onPress={() => setSex(sex === "male" ? undefined : "male")} icon="gender-male">
            Erkek
          </Chip>
          <Chip selected={status === "archived"} onPress={() => setStatus(status === "active" ? "archived" : "active")} icon="archive-outline">
            Arşiv
          </Chip>
        </ScrollView>
        <Text variant="labelMedium" style={styles.count}>
          {list.isLoading ? "Yükleniyor" : `${rows.length} hayvan`}
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          list.isLoading ? null : (
            <Text style={styles.empty}>
              {search || species || sex ? "Eşleşen hayvan yok." : status === "archived" ? "Arşivde hayvan yok." : "Henüz hayvan yok. Sağ alttan ekleyin."}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.name ? `${item.tagNo} · ${item.name}` : item.tagNo}
            description={describe(item)}
            testID={`animal-row-${item.tagNo}`}
            onPress={() => router.push({ pathname: "/(app)/animals/[id]", params: { id: item.id } })}
            left={(p) => <List.Icon {...p} icon={item.sex === "male" ? "gender-male" : item.sex === "castrated" ? "circle-outline" : "gender-female"} />}
            right={(p) => (item.syncSeq === 0 ? <List.Icon {...p} icon="cloud-upload-outline" /> : null)}
          />
        )}
      />

      <FAB icon="plus" label="Hayvan ekle" style={styles.fab} onPress={() => router.push("/(app)/animals/new")} testID="animal-add" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { padding: 12, gap: 8 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  flex: { flex: 1 },
  chips: { gap: 8, paddingVertical: 2 },
  count: { opacity: 0.6, paddingHorizontal: 4 },
  list: { paddingBottom: 96 },
  empty: { textAlign: "center", opacity: 0.6, padding: 24 },
  fab: { position: "absolute", right: 16, bottom: 16 },
});
