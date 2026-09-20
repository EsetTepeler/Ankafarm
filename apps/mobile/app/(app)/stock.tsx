import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

export default function StockScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium">Stok</Text>
      <Text variant="bodyMedium" style={styles.muted}>
        Kalemler, alım ve günlük tüketim girişi Faz 2 ile gelecek.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  muted: { opacity: 0.7 },
});
