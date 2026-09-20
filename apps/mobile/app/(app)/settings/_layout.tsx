import { Stack } from "expo-router";
import { useTheme } from "react-native-paper";

export default function SettingsLayout() {
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
      <Stack.Screen name="index" options={{ title: "Ayarlar" }} />
      <Stack.Screen name="groups" options={{ title: "Gruplar" }} />
      <Stack.Screen name="sync" options={{ title: "Senkron durumu" }} />
    </Stack>
  );
}
