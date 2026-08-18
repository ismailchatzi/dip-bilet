const LONG_HAUL = new Set(["DPS", "HKT", "MLE"]);
const NEAR_DAYS = 21;
const POST_NEAR = 0.7;
const POST_FAR = 0.75;
const LONG_HAUL_NEAR = 0.9;
const LONG_HAUL_FAR = 0.95;

export function isLongHaulDest(code: string) {
  return LONG_HAUL.has(code.toUpperCase());
}

export function stayRange(code: string): [number, number] {
  return isLongHaulDest(code) ? [7, 10] : [4, 10];
}

/** Bali / Phuket / Maldivler: 2 aktarma. Diğer şehirler: 1. */
export function maxStopsForDest(code: string) {
  return isLongHaulDest(code) ? 2 : 1;
}

export function scrappaMaxStopsParam(code: string) {
  return maxStopsForDest(code) >= 2 ? "two_or_fewer" : "one_or_fewer";
}

export function nightsBetween(out: string, back: string) {
  const a = Date.parse(`${out}T12:00:00Z`);
  const b = Date.parse(`${back}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  return Math.round((b - a) / 86_400_000);
}

/** TR tarihi (UTC+3, yaz/kış yok) */
export function turkeyTodayIso(now = new Date()) {
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number) {
  const t = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Vitrin kapısı. Avrupa: yakın %30 (0.70) / uzak %25 (0.75).
 * Uzak doğu (DPS/HKT/MLE): yakın %10 (0.90) / uzak %5 (0.95).
 */
export function postRatioForOutbound(
  outDate: string,
  destCode = "",
  today = turkeyTodayIso(),
) {
  const near = outDate <= addDaysIso(today, NEAR_DAYS);
  if (isLongHaulDest(destCode)) {
    return near ? LONG_HAUL_NEAR : LONG_HAUL_FAR;
  }
  return near ? POST_NEAR : POST_FAR;
}

