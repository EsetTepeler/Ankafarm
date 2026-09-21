import { z } from "zod";

/** Ortak alan doğrulayıcıları; hayvan, stok ve finans şemaları aynı kuralları kullanır. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı");
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
/** Para, TL. numeric(12,2) sınırına uyar. */
export const moneySchema = z.number().nonnegative().max(99_999_999);
/** Miktar: kg, balya, kova, litre. */
export const quantitySchema = z.number().positive("Miktar sıfırdan büyük olmalı").max(1_000_000);

/** Para gösterimi: 12.345,67 TL */
export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
}

/** Sayı gösterimi: binlik ayraçlı, gereksiz sıfır yok. */
export function formatNumber(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}
