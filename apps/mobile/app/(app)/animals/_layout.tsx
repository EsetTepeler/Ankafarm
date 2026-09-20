import { Stack } from "expo-router";
import { useTheme } from "react-native-paper";

export default function AnimalsLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Hayvanlar" }} />
      <Stack.Screen name="new" options={{ title: "Hayvan ekle" }} />
      <Stack.Screen name="[id]" options={{ title: "Hayvan" }} />
      <Stack.Screen name="bulk" options={{ title: "Toplu sağlık girişi" }} />
    </Stack>
  );
}
