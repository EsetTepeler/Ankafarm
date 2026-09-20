import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Redirect, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { View, type ColorValue } from "react-native";
import { useTheme } from "react-native-paper";

import { SyncBanner } from "@/components/SyncBanner";
import { useAuthStore } from "@/lib/auth";
import { useSyncTriggers } from "@/sync/useSyncTriggers";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size} />
  );
}

function AppTabs() {
  const theme = useTheme();
  useSyncTriggers();

  return (
    <View style={{ flex: 1 }}>
      <SyncBanner />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerShadowVisible: false,
          tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          sceneStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Bugün", tabBarIcon: tabIcon("view-dashboard-outline") }} />
        <Tabs.Screen name="animals" options={{ title: "Hayvanlar", headerShown: false, tabBarIcon: tabIcon("sheep") }} />
        <Tabs.Screen name="stock" options={{ title: "Stok", tabBarIcon: tabIcon("barn") }} />
        <Tabs.Screen name="settings" options={{ title: "Ayarlar", headerShown: false, tabBarIcon: tabIcon("cog-outline") }} />
      </Tabs>
    </View>
  );
}

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  if (status !== "signedIn") return <Redirect href="/(auth)/login" />;
  return <AppTabs />;
}
