import { differenceInDays, differenceInMonths, differenceInYears, format, formatDistanceToNow, isValid, parse } from "date-fns";
import { tr } from "date-fns/locale";

/** 20 Eylül 2026 */
export function formatDate(date: Date | string | number): string {
  return format(new Date(date), "d MMMM yyyy", { locale: tr });
}

/** 20 Eyl 2026, 14:05 */
export function formatDateTime(date: Date | string | number): string {
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: tr });
}

/** "3 gün önce" */
export function formatRelative(date: Date | string | number): string {
  return formatDistanceToNow(new Date(date), { locale: tr, addSuffix: true });
}

/** Bugün, YYYY-AA-GG. */
export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parse(value, "yyyy-MM-dd", new Date()));
}

/** ISO tarih → "10.03.2026" görünümü. */
export function isoToDisplay(iso: string | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return "";
  return format(parse(iso, "yyyy-MM-dd", new Date()), "dd.MM.yyyy");
}

/** "10.03.2026", "10/03/2026" veya "2026-03-10" → ISO; geçersizse null. */
export function displayToIso(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (isIsoDate(t)) return t;
  for (const pattern of ["dd.MM.yyyy", "dd/MM/yyyy", "d.M.yyyy", "d/M/yyyy"]) {
    const d = parse(t, pattern, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

/** "2 yaş 5 ay", "4 aylık", "12 günlük". Doğum tarihi yoksa boş. */
export function formatAge(birthDate: string | null | undefined, now = new Date()): string {
  if (!birthDate || !isIsoDate(birthDate)) return "";
  const born = parse(birthDate, "yyyy-MM-dd", new Date());
  const years = differenceInYears(now, born);
  const months = differenceInMonths(now, born) - years * 12;
  if (years >= 1) return months > 0 ? `${years} yaş ${months} ay` : `${years} yaş`;
  const totalMonths = differenceInMonths(now, born);
  if (totalMonths >= 1) return `${totalMonths} aylık`;
  return `${Math.max(0, differenceInDays(now, born))} günlük`;
}
