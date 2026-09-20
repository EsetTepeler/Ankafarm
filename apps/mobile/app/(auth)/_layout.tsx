import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/lib/auth";

export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);
  if (status === "signedIn") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
