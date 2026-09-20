// Expo varsayılan Metro ayarı + Drizzle .sql migration'ları + web'de expo-sqlite (wasm, COOP/COEP).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Drizzle migration dosyaları (.sql) inline-import ile bundle'a girer.
config.resolver.sourceExts.push("sql");

// expo-sqlite web: wasm dosyası ve SharedArrayBuffer için gerekli başlıklar (geliştirme sunucusu).
config.resolver.assetExts.push("wasm");
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  return middleware(req, res, next);
};

module.exports = config;
