import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

import { describeSync, useSyncStore } from "@/sync/store";
import { syncNow } from "@/sync/worker";

/** İnce durum şeridi: bağlantı yokken ve bekleyen kayıt varken görünür, dokununca senkron dener. */
export function SyncBanner() {
  const theme = useTheme();
  const state = useSyncStore();
  const { tone, text } = describeSync(state);
  if (!text) return null;

  const colors = {
    ok: [theme.colors.primaryContainer, theme.colors.onPrimaryContainer],
    info: [theme.colors.secondaryContainer, theme.colors.onSecondaryContainer],
    warn: [theme.colors.tertiaryContainer, theme.colors.onTertiaryContainer],
    error: [theme.colors.errorContainer, theme.colors.onErrorContainer],
  }[tone];

  return (
    <Pressable onPress={() => void syncNow("manual")} testID="sync-banner">
      <View style={[styles.bar, { backgroundColor: colors[0] }]}>
        <Text variant="labelMedium" style={{ color: colors[1] }}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 6, paddingHorizontal: 16, alignItems: "center" },
});
