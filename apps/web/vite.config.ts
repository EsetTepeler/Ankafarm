import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// COOP/COEP: tarayıcı SQLite'ı (OPFS + SharedArrayBuffer) için şart. Üretimde nginx aynı başlıkları verir.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/** Drizzle migration dosyaları (.sql) bundle'a metin olarak girer. */
const sqlAsText = {
  name: "anka-sql-as-text",
  transform(code: string, id: string) {
    if (!id.endsWith(".sql")) return null;
    return { code: `export default ${JSON.stringify(code)};`, map: null };
  },
};

export default defineConfig({
  plugins: [
    sqlAsText,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Anka Farm",
        short_name: "Anka Farm",
        description: "Küçükbaş çiftlik yönetim paneli",
        lang: "tr",
        start_url: "/",
        display: "standalone",
        background_color: "#fafaf9",
        theme_color: "#2e7d32",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // API ve config asla önbelleğe alınmaz; uygulama kabuğu alınır.
        navigateFallbackDenylist: [/^\/trpc\//, /^\/config\.json$/],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  server: { headers: isolationHeaders, host: true },
  preview: { headers: isolationHeaders },
  worker: { format: "es" },
});
