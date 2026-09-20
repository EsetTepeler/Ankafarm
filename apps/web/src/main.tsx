import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./App";

// www ile açılan eski sekmeler (önbellekli service worker) ana adrese taşınır; yerel veritabanı
// origin'e bağlı olduğundan iki ayrı kopya oluşmasın.
if (window.location.hostname.startsWith("www.")) {
  window.location.replace(window.location.href.replace("//www.", "//"));
}

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
