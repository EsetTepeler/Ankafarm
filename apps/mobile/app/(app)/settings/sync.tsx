import { useQuery } from "@tanstack/react-query";
import { desc } from "drizzle-orm";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Card, List, Text } from "react-native-paper";

import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { useSyncStore } from "@/sync/store";
import { discardFailed, retryFailed, syncNow } from "@/sync/worker";
import { formatDateTime } from "@/utils/date";

export default function SyncScreen() {
  const sync = useSyncStore();
  const rows = useQuery({
    queryKey: ["local", "outbox", sync.pending, sync.failed, sync.status],
    queryFn: () => getDb().select().from(outbox).orderBy(desc(outbox.clientCreatedAt)).limit(100),
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Card.Title
          title={sync.online ? "Bağlantı var" : "Çevrimdışı"}
          subtitle={sync.lastSyncAt ? `Son senkron ${formatDateTime(sync.lastSyncAt)}` : "Henüz senkron olmadı"}
        />
        <Card.Content>
          <Text variant="bodyMedium">Bekleyen: {sync.pending} · Reddedilen: {sync.failed}</Text>
          {sync.lastError ? (
            <Text variant="bodySmall" style={styles.error}>
              {sync.lastError}
            </Text>
          ) : null}
        </Card.Content>
        <Card.Actions>
          <Button mode="contained" icon="sync" loading={sync.status === "syncing"} onPress={() => void syncNow("manual")}>
            Şimdi senkronla
          </Button>
        </Card.Actions>
      </Card>

      <List.Section title="Kuyruk">
        {(rows.data ?? []).length === 0 ? (
          <Text style={styles.muted}>Kuyruk boş, her şey sunucuda.</Text>
        ) : null}
        {(rows.data ?? []).map((r) => (
          <List.Item
            key={r.mutationId}
            title={`${r.table} · ${r.op} · ${r.rowId.slice(0, 8)}`}
            description={r.status === "failed" ? `${r.rejectionCode ?? ""} ${r.lastError ?? ""}`.trim() : `${r.status} · ${formatDateTime(r.clientCreatedAt)}`}
            left={(p) => <List.Icon {...p} icon={r.status === "failed" ? "alert-circle-outline" : "clock-outline"} />}
            right={() =>
              r.status === "failed" ? (
                <>
                  <Button compact onPress={() => void retryFailed(r.mutationId)}>
                    Yeniden dene
                  </Button>
                  <Button compact textColor="#B3261E" onPress={() => void discardFailed(r.mutationId)}>
                    Sil
                  </Button>
                </>
              ) : null
            }
          />
        ))}
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  muted: { opacity: 0.6, paddingHorizontal: 16 },
  error: { marginTop: 8, opacity: 0.8 },
});
