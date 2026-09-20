/** Küçük değerler (token, tercih) için localStorage; tarayıcı engellerse sessizce boş döner. */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // depolama kapalı
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // yok say
    }
  },
};
