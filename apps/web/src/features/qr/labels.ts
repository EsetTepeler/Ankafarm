import QRCode from "qrcode";

import { animalUrl } from "@/features/qr/qr";

export interface LabelAnimal {
  id: string;
  tagNo: string;
  name?: string | null;
}

/** Sayfa düzeni: sütun sayısı etiket boyutunu belirler. A4 dikey, 10 mm kenar boşluğu. */
export const labelLayouts = {
  large: { columns: 2, label: "Büyük", hint: "2 sütun · padok kartı" },
  medium: { columns: 3, label: "Orta", hint: "3 sütun · küpe etiketi" },
  small: { columns: 4, label: "Küçük", hint: "4 sütun · çok sayıda" },
} as const;
export type LabelSize = keyof typeof labelLayouts;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Etiket sayfası: her etikette profil adresinin QR'ı, altında küpe numarası ve isim.
 * QR içeriği her zaman web adresi (bölüm 9); uygulama adresten kimliği ayıklar, telefonun
 * kendi kamerası da aynı adresi açar.
 */
export async function buildLabelSheet(items: LabelAnimal[], size: LabelSize, farmName: string): Promise<string> {
  const { columns } = labelLayouts[size];
  const qrSize = size === "large" ? 320 : size === "medium" ? 260 : 200;
  const cells = await Promise.all(
    items.map(async (a) => {
      const png = await QRCode.toDataURL(animalUrl(a.id), { width: qrSize, margin: 1, errorCorrectionLevel: "M" });
      return `<div class="label">
        <img src="${png}" alt="">
        <div class="tag">${escapeHtml(a.tagNo)}</div>
        ${a.name ? `<div class="name">${escapeHtml(a.name)}</div>` : ""}
        <div class="farm">${escapeHtml(farmName)}</div>
      </div>`;
    }),
  );

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Küpe etiketleri</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 4mm; }
  .label { border: 1px dashed #b3bdb6; border-radius: 3mm; padding: 3mm; text-align: center; break-inside: avoid; }
  .label img { width: 100%; height: auto; display: block; }
  .tag { font-size: ${size === "small" ? "14pt" : "18pt"}; font-weight: 700; margin-top: 1mm; letter-spacing: 0.02em; color: #0F3D2E; }
  .name { font-size: ${size === "small" ? "9pt" : "11pt"}; color: #4E7F46; }
  .farm { font-size: 7pt; color: #8a938c; margin-top: 1mm; letter-spacing: 0.08em; text-transform: uppercase; }
  @media screen { body { background: #FBF6EF; padding: 10mm; } .sheet { background: #fff; padding: 10mm; border-radius: 4mm; box-shadow: 0 1px 3px rgba(15,61,46,.12); } }
  .bar { margin-bottom: 6mm; display: flex; gap: 8px; align-items: center; font-size: 10pt; color: #444; }
  .bar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 0; background: #0F3D2E; color: #FBF6EF; cursor: pointer; }
  @media print { .bar { display: none; } }
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Yazdır</button><span>${items.length} etiket · yazdırma penceresinden PDF olarak da kaydedebilirsin</span></div>
<div class="sheet">${cells.join("")}</div>
<script>window.onload = function () { window.print(); };<\/script>
</body></html>`;
}

/** Yeni sekmede etiket sayfasını açar ve yazdırma penceresini getirir. Açılır pencere engellenirse false döner. */
export async function printLabelSheet(items: LabelAnimal[], size: LabelSize, farmName: string): Promise<boolean> {
  const html = await buildLabelSheet(items, size, farmName);
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
