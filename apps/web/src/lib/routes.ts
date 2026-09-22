/**
 * Rota haritası: başlık çubuğundaki ad ve geri düğmesinin nereye gideceği buradan gelir.
 * Tek kaynak olması önemli — önceden başlık kenar çubuğu menüsünden türetiliyordu ve alt
 * sayfalarda üst sayfanın adı yazıyordu ("Gruplar ve bölmeler" yerine "Ayarlar").
 *
 * Geri düğmesi tarayıcı geçmişi yerine üst rotaya gider: QR etiketinden doğrudan açılan
 * profilde geçmiş boş oluyor ve `history.back()` uygulamadan çıkarıyordu.
 */
export interface RouteMeta {
  /** Başlık çubuğunda görünen ad. */
  label: string;
  /** Geri düğmesinin hedefi; yoksa düğme çıkmaz (ana sayfalar). */
  parent?: string;
}

const staticRoutes: Record<string, RouteMeta> = {
  "/": { label: "Bugün" },
  "/animals": { label: "Hayvanlar" },
  "/animals/new": { label: "Hayvan ekle", parent: "/animals" },
  "/animals/bulk": { label: "Toplu işlem" },
  "/animals/round": { label: "Günlük tur" },
  "/scan": { label: "QR tara" },
  "/stock": { label: "Stok" },
  "/finance": { label: "Finans" },
  "/reports": { label: "Raporlar" },
  "/reminders": { label: "Hatırlatıcılar" },
  "/insights": { label: "İçgörüler" },
  "/breeding": { label: "Damızlık" },
  "/transfers": { label: "Devirler" },
  "/settings": { label: "Ayarlar" },
  "/settings/groups": { label: "Gruplar ve bölmeler", parent: "/settings" },
  "/settings/sync": { label: "Senkron durumu", parent: "/settings" },
  "/settings/export": { label: "Dışa aktarma", parent: "/settings" },
  "/settings/protocols": { label: "Aşı ve bakım programı", parent: "/settings" },
  "/settings/system": { label: "Sistem durumu", parent: "/settings" },
  "/settings/thresholds": { label: "İçgörü eşikleri", parent: "/settings" },
  "/settings/users": { label: "Kullanıcılar", parent: "/settings" },
  "/audit": { label: "Değişiklik geçmişi", parent: "/settings" },
};

/** Kimlik taşıyan rotalar: `/animals/<id>` ve `/animals/<id>/edit`. */
export function routeMeta(pathname: string): RouteMeta {
  const exact = staticRoutes[pathname];
  if (exact) return exact;

  const editMatch = /^\/animals\/([^/]+)\/edit$/.exec(pathname);
  if (editMatch) return { label: "Hayvanı düzenle", parent: `/animals/${editMatch[1]}` };

  // QR ile gelen /a/<id> de profildir; listeye döner.
  if (/^\/(animals|a)\/[^/]+$/.test(pathname)) return { label: "Hayvan", parent: "/animals" };

  return { label: "" };
}
