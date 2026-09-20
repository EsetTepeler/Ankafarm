import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

/** Çiftlik teması: toprak ve yeşil tonları, MD3 üzerine. */
const lightColors = {
  primary: "#2E7D32",
  onPrimary: "#FFFFFF",
  primaryContainer: "#B7EFB4",
  onPrimaryContainer: "#00210A",
  secondary: "#6D5E00",
  secondaryContainer: "#FBE380",
  tertiary: "#5D4037",
  error: "#B3261E",
};

const darkColors = {
  primary: "#9CD69A",
  onPrimary: "#003911",
  primaryContainer: "#1B5E20",
  onPrimaryContainer: "#B7EFB4",
  secondary: "#DCC85F",
  secondaryContainer: "#524600",
  tertiary: "#D7B9AC",
  error: "#F2B8B5",
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, ...lightColors },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, ...darkColors },
};
