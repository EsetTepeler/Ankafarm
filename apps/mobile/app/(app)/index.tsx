import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Card, Text } from "react-native-paper";

import { useAuthStore } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";
import { describeSync, useSyncStore } from "@/sync/store";
import { syncNow } from "@/sync/worker";
import { formatDate, formatDateTime } from "@/utils/date";

export default function TodayScreen() {
  const trpc = useTRPC();
  const router = useRouter();
  const cachedUser = useAuthStore((s) => s.user);
  const me = useQuery(trpc.auth.me.queryOptions());
  const sync = useSyncStore();

  const user = me.data?.user ?? cachedUser;
  const farmName = me.data?.farm.name ?? "Çiftlik";

  const described = describeSync(sync);
  const syncSubtitle = described.text ?? (sync.lastSyncAt ? `Güncel · ${formatDateTime(sync.lastSyncAt)}` : "Henüz senkron olmadı");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall">Merhaba{user ? `, ${user.fullName.split(" ")[0]}` : ""}</Text>
      <Text variant="bodyMedium" style={styles.muted}>
        {farmName} · {formatDate(new Date())}
      </Text>

      <Card>
        <Card.Title title="Senkron" subtitle={syncSubtitle} />
        <Card.Content>
          <Text variant="bodySmall" style={styles.muted}>
            Bekleyen {sync.pending} · Reddedilen {sync.failed}
          </Text>
          {sync.lastError ? (
            <Text variant="bodySmall" style={styles.error} selectable>
              {sync.lastError}
            </Text>
          ) : null}
        </Card.Content>
        <Card.Actions>
          <Button onPress={() => router.push("/(app)/settings/sync")}>Ayrıntı</Button>
          <Button mode="contained-tonal" icon="sync" onPress={() => void syncNow("manual")}>
            Şimdi senkronla
          </Button>
        </Card.Actions>
      </Card>

      <Card>
        <Card.Title title="Sürü" subtitle="Faz 1 ile dolacak" />
        <Card.Content>
          <Text variant="bodySmall" style={styles.muted}>
            Toplam, dişi, erkek, yavru ve gebe sayıları burada görünecek.
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Bugünkü işler" subtitle="Faz 1 ile dolacak" />
        <Card.Content>
          <Text variant="bodySmall" style={styles.muted}>
            Geciken aşılar, yaklaşan doğumlar ve olağandışı gözlemler.
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  muted: { opacity: 0.7 },
  error: { marginTop: 8, color: "#F2B8B5" },
});
