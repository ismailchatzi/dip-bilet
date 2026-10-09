import type { ExternalDatePair } from "@/lib/external/types";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";

const MAX_AHEAD_DAYS = 330;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kaynaklarda yıl yazım hataları var (geçmiş / 1 yıldan uzak tarih, dönüş < gidiş) → elenir.
 * Aynı çift bir kez; gidiş tarihine göre sıralı.
 */
export function cleanPairs(
  pairs: ExternalDatePair[],
  today = turkeyTodayIso(),
): ExternalDatePair[] {
  const latest = addDaysIso(today, MAX_AHEAD_DAYS);
  const seen = new Set<string>();
  const out: ExternalDatePair[] = [];
  for (const p of pairs) {
    if (!p.from || !p.to || !ISO_DATE.test(p.out)) continue;
    if (p.ret && !ISO_DATE.test(p.ret)) continue;
    if (p.out < today || p.out > latest || (p.ret && p.ret < p.out)) continue;
    const key = `${p.from}>${p.to}|${p.out}|${p.ret ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.sort((a, b) => a.out.localeCompare(b.out) || (a.ret ?? "").localeCompare(b.ret ?? ""));
}

export function istanbulCode(code: string) {
  const c = code.toUpperCase();
  return c === "SAW" ? "SAW" : c === "IST" || c === "ISTA" ? "IST" : null;
}

function yymmdd(s: string) {
  return /^\d{6}$/.test(s) ? `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}` : null;
}

/**
 * Skyscanner yol biçimi …/transport/flights/ista/del/261124/261202/ → tarih çifti.
 * Şehir kodları 4 harfli olabiliyor (BKKT) → ilk 3 harf; varış kodu kaynakta varsa onu kullan.
 */
export function skyscannerPathPair(url: string): ExternalDatePair | null {
  const m = url.match(/\/transport\/flights\/([a-z]{3,4})\/([a-z]{3,4})\/(\d{6})\/(?:(\d{6})\/?)?/i);
  if (!m) return null;
  const out = yymmdd(m[3]!);
  if (!out) return null;
  return {
    from: istanbulCode(m[1]!) ?? m[1]!.toUpperCase().slice(0, 3),
    to: m[2]!.toUpperCase().slice(0, 3),
    out,
    ret: m[4] ? yymmdd(m[4]) : null,
  };
}

export function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
