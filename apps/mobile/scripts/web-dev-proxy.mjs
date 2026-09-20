#!/usr/bin/env node
/**
 * Geliştirme proxy'si: Expo dev sunucusunun (Metro, 8081) önüne geçer ve her yanıta
 * Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy başlıklarını ekler.
 *
 * Neden: expo-sqlite web'de SharedArrayBuffer ister; bunun için HTML sayfasının kendisi
 * bu başlıklarla gelmeli. Expo SDK 57'de dev sunucusu HTML'i middleware zincirinin
 * en başında verdiği için metro.config.js'deki enhanceMiddleware HTML'e ulaşamıyor.
 * Üretimde nginx aynı başlıkları ekler (docker/nginx.conf).
 *
 * Kullanım: corepack pnpm --filter @anka/mobile web:isolated  → http://localhost:8090
 * Ortam: METRO_PORT (varsayılan 8081), PROXY_PORT (varsayılan 8090)
 */
import http from "node:http";
import net from "node:net";

const METRO_HOST = process.env.METRO_HOST ?? "127.0.0.1";
const METRO_PORT = Number(process.env.METRO_PORT ?? 8081);
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8090);

const EXTRA_HEADERS = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "credentialless",
};

const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: METRO_HOST, port: METRO_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `${METRO_HOST}:${METRO_PORT}` } },
    (up) => {
      const headers = { ...up.headers, ...EXTRA_HEADERS };
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Metro'ya ulaşılamadı (${METRO_HOST}:${METRO_PORT}): ${err.message}\nÖnce "corepack pnpm mobile" ile Expo'yu başlatın.`);
  });
  req.pipe(upstream);
});

// HMR ve Expo dev araçları WebSocket kullanır; ham soket olarak geçir.
server.on("upgrade", (req, socket, head) => {
  const target = net.connect(METRO_PORT, METRO_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === "host") lines.push(`host: ${METRO_HOST}:${METRO_PORT}`);
      else lines.push(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
    }
    target.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length) target.write(head);
    socket.pipe(target).pipe(socket);
  });
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
});

server.listen(PROXY_PORT, () => {
  console.log(`Web dev proxy: http://localhost:${PROXY_PORT} → Metro ${METRO_HOST}:${METRO_PORT} (COOP/COEP eklenmiş)`);
});
