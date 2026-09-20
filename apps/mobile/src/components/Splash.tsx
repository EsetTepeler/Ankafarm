import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";

export function Splash({ message = "Yükleniyor", children }: { message?: string; children?: ReactNode }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text variant="bodyMedium" style={styles.text}>
        {message}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  text: { opacity: 0.7 },
});
