import { useQuery } from "@tanstack/react-query";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Card, List, Text } from "react-native-paper";

import { getDb } from "@/db";
import { animals } from "@/db/schema";
import { usePedigree, type PedigreeTree } from "@/features/animals/pedigree";
import { formatAge } from "@/utils/date";

function useOffspring(animalId: string) {
  return useQuery({
    queryKey: ["local", "animals", "offspring", animalId],
    queryFn: () =>
      getDb()
        .select({ id: animals.id, tagNo: animals.tagNo, name: animals.name, sex: animals.sex, birthDate: animals.birthDate, status: animals.status })
        .from(animals)
        .where(and(isNull(animals.deletedAt), or(eq(animals.motherId, animalId), eq(animals.fatherId, animalId))))
        .orderBy(asc(animals.birthDate)),
  });
}

function Branch({ tree, label, depth, onOpen }: { tree: PedigreeTree | undefined; label: string; depth: number; onOpen: (id: string) => void }) {
  const node = tree?.node;
  return (
    <View style={[styles.branch, { marginLeft: depth * 16 }]}>
      <List.Item
        title={node ? (node.name ? `${node.tagNo} · ${node.name}` : node.tagNo) : "Bilinmiyor"}
        description={label}
        onPress={node ? () => onOpen(node.id) : undefined}
        left={(p) => <List.Icon {...p} icon={label.startsWith("Anne") ? "gender-female" : "gender-male"} />}
        testID={`pedigree-${label.toLowerCase().replace(/[^a-z]/g, "")}`}
      />
      {node && tree && (tree.mother || tree.father) ? (
        <>
          <Branch tree={tree.mother} label={`${label}nin annesi`} depth={depth + 1} onOpen={onOpen} />
          <Branch tree={tree.father} label={`${label}nin babası`} depth={depth + 1} onOpen={onOpen} />
        </>
      ) : null}
    </View>
  );
}

/** Profildeki Soy ağacı sekmesi: üç nesil ata ve yavrular, tamamı yerel veritabanından. */
export function PedigreeSection({ animalId }: { animalId: string }) {
  const router = useRouter();
  const pedigree = usePedigree(animalId, 3);
  const offspring = useOffspring(animalId);
  const open = (id: string) => router.push({ pathname: "/(app)/animals/[id]", params: { id } });
  const tree = pedigree.data;

  return (
    <>
      <Card>
        <Card.Title title="Atalar" />
        <Card.Content>
          {tree && (tree.mother || tree.father) ? (
            <>
              <Branch tree={tree.mother} label="Anne" depth={0} onOpen={open} />
              <Branch tree={tree.father} label="Baba" depth={0} onOpen={open} />
            </>
          ) : (
            <Text style={styles.muted}>{pedigree.isLoading ? "Yükleniyor" : "Anne ve baba bilgisi yok."}</Text>
          )}
        </Card.Content>
      </Card>
      <Card>
        <Card.Title title="Yavrular" subtitle={offspring.data?.length ? `${offspring.data.length} yavru` : undefined} />
        <Card.Content>
          {(offspring.data ?? []).map((c) => (
            <List.Item
              key={c.id}
              title={c.name ? `${c.tagNo} · ${c.name}` : c.tagNo}
              description={[c.sex === "female" ? "Dişi" : c.sex === "male" ? "Erkek" : "Kısır", formatAge(c.birthDate), c.status !== "active" ? "arşiv" : null].filter(Boolean).join(" · ")}
              onPress={() => open(c.id)}
              left={(p) => <List.Icon {...p} icon="baby-face-outline" />}
              testID={`offspring-${c.tagNo}`}
            />
          ))}
          {offspring.data?.length === 0 ? <Text style={styles.muted}>Kayıtlı yavru yok.</Text> : null}
        </Card.Content>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  branch: { gap: 0 },
  muted: { opacity: 0.7 },
});
