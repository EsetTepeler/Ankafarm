import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { storage } from "./storage";

type Theme = "light" | "dark";
const KEY = "anka.theme";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

function readInitial(): Theme {
  const saved = storage.get(KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Tema: html üzerinde .dark sınıfı, tercih localStorage'da. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    storage.set(KEY, t);
    setThemeState(t);
  }, []);
  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
