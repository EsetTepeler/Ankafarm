import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Native'de SecureStore, web'de localStorage. Sadece küçük değerler (token, tercih) için. */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // depolama kapalıysa sessizce geç
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // yok say
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
