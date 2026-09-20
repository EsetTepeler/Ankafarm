import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Divider, List, Text } from "react-native-paper";

import { useAuthStore } from "@/lib/auth";
import { appVersion, getApiUrl } from "@/lib/config";
import { useTRPC } from "@/lib/trpc";
import { useSyncStore } from "@/sync/store";
import { formatDateTime } from "@/utils/date";

const roleLabels = { owner: "Sahip", worker: "Bakıcı", vet: "Veteriner" } as const;

export default function SettingsScreen() {
  const trpc = useTRPC();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const sync = useSyncStore();
  const farm = useQuery(trpc.farm.get.queryOptions());
  const users = useQuery({ ...trpc.users.list.queryOptions(), enabled: user?.role === "owner" });

  async function logout() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Section title="Hesap">
        <List.Item title={user?.fullName ?? "-"} description={user?.email} left={(p) => <List.Icon {...p} icon="account" />} />
        <List.Item title="Rol" description={user ? roleLabels[user.role] : "-"} left={(p) => <List.Icon {...p} icon="shield-account" />} />
      </List.Section>

      <Divider />

      <List.Section title="Çiftlik">
        <List.Item
          title={farm.data?.name ?? "Yükleniyor"}
          description={farm.data?.location ?? "Konum girilmemiş"}
          left={(p) => <List.Icon {...p} icon="barn" />}
        />
        <List.Item
          title="Gruplar ve bölmeler"
          description="Ana sürü, karantina, mera"
          left={(p) => <List.Icon {...p} icon="view-grid-outline" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push("/(app)/settings/groups")}
        />
        <List.Item
          title="Senkron durumu"
          description={`${sync.pending} bekliyor · ${sync.failed} reddedildi${sync.lastSyncAt ? ` · son ${formatDateTime(sync.lastSyncAt)}` : ""}`}
          left={(p) => <List.Icon {...p} icon="sync" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push("/(app)/settings/sync")}
        />
      </List.Section>

      {user?.role === "owner" && (
        <>
          <Divider />
          <List.Section title="Kullanıcılar">
            {(users.data ?? []).map((u) => (
              <List.Item
                key={u.id}
                title={u.fullName}
                description={`${u.email} · ${roleLabels[u.role]}${u.active ? "" : " · devre dışı"}${u.lastLoginAt ? ` · son giriş ${formatDateTime(u.lastLoginAt)}` : ""}`}
                left={(p) => <List.Icon {...p} icon={u.active ? "account-check" : "account-off"} />}
              />
            ))}
            <Text variant="bodySmall" style={styles.hint}>
              Kullanıcı ekleme ve devre dışı bırakma arayüzü sonra; şimdilik API üzerinden.
            </Text>
          </List.Section>
        </>
      )}

      <Divider />

      <List.Section title="Sistem">
        <List.Item title="API adresi" description={getApiUrl()} left={(p) => <List.Icon {...p} icon="server" />} />
        <List.Item title="Sürüm" description={appVersion} left={(p) => <List.Icon {...p} icon="information-outline" />} />
      </List.Section>

      <Button mode="outlined" onPress={logout} icon="logout" style={styles.logout}>
        Çıkış yap
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  hint: { opacity: 0.6, paddingHorizontal: 16, paddingTop: 4 },
  logout: { marginTop: 16 },
});
