/**
 * Vitrin motoru — production locks (manual_initial v1).
 * benchmark_mode: synthetic_rt_candidate (ileride verified_rt).
 */

export type DealBadge = "MUTLAK_FIRSAT" | "SEZONLUK_DIP";

export type BenchmarkMode = "synthetic_rt_candidate" | "verified_rt";

export type RouteLane = "balkan_vizesiz" | "schengen_avrupa" | "tropik_uzakdogu";

export type HardFloorEntry = {
  floor: number;
  version: string;
  source: "manual_initial_heuristic";
};

/** Kartta üstü çizili (Standart) — her zaman eşikten yüksek: max(baz, eşik) × 1.10 */
export const STRIKE_RATIO = 1.1;

/**
 * Standart asla eşiğin altında olmaz.
 * preferredBase = medyan / Google avg (varsa); yoksa yalnız eşik × 1.10.
 */
export function strikeFromThreshold(
  uiThreshold: number,
  preferredBase?: number | null,
): number {
  const t = Number.isFinite(uiThreshold) && uiThreshold > 0 ? uiThreshold : 0;
  const b =
    typeof preferredBase === "number" &&
    Number.isFinite(preferredBase) &&
    preferredBase > 0
      ? preferredBase
      : 0;
  const base = Math.max(t, b);
  return Math.round(base * STRIKE_RATIO);
}

/** Snapshot kart: averagePrice (Standart) < threshold ise düzelt. */
export function clampDealStrikePrices<
  T extends { averagePrice?: number; thresholdPrice?: number; price?: number; discountPercent?: number },
>(deal: T): T {
  const thr = deal.thresholdPrice;
  const avg = deal.averagePrice;
  if (typeof thr !== "number" || !(thr > 0)) return deal;
  if (typeof avg === "number" && avg >= thr) return deal;
  const strike = strikeFromThreshold(thr, avg);
  const price = deal.price;
  const discountPercent =
    typeof price === "number" && strike > 0
      ? Math.round(((strike - price) / strike) * 100)
      : deal.discountPercent;
  return { ...deal, averagePrice: strike, discountPercent };
}

/** Google Deals: avg × 0.75 altı (hard floor yoksa) */
export const GOOGLE_AVG_GATE = 0.75;

export const BENCHMARK_MODE: BenchmarkMode = "synthetic_rt_candidate";

export const HARD_FLOORS: Record<string, HardFloorEntry> = {
  TIA: { floor: 110, version: "v1.0", source: "manual_initial_heuristic" },
  SJJ: { floor: 120, version: "v1.0", source: "manual_initial_heuristic" },
  SKP: { floor: 115, version: "v1.0", source: "manual_initial_heuristic" },
  BEG: { floor: 135, version: "v1.0", source: "manual_initial_heuristic" },
  TBS: { floor: 110, version: "v1.0", source: "manual_initial_heuristic" },
  GYD: { floor: 140, version: "v1.0", source: "manual_initial_heuristic" },
  SSH: { floor: 120, version: "v1.0", source: "manual_initial_heuristic" },
  ATH: { floor: 100, version: "v1.0", source: "manual_initial_heuristic" },
  BUD: { floor: 135, version: "v1.0", source: "manual_initial_heuristic" },
  VIE: { floor: 145, version: "v1.0", source: "manual_initial_heuristic" },
  SOF: { floor: 115, version: "v1.0", source: "manual_initial_heuristic" },
  PRG: { floor: 150, version: "v1.0", source: "manual_initial_heuristic" },
  FCO: { floor: 150, version: "v1.0", source: "manual_initial_heuristic" },
  VCE: { floor: 145, version: "v1.0", source: "manual_initial_heuristic" },
  MXP: { floor: 150, version: "v1.0", source: "manual_initial_heuristic" },
  MUC: { floor: 155, version: "v1.0", source: "manual_initial_heuristic" },
  BER: { floor: 140, version: "v1.0", source: "manual_initial_heuristic" },
  FRA: { floor: 150, version: "v1.0", source: "manual_initial_heuristic" },
  AMS: { floor: 165, version: "v1.0", source: "manual_initial_heuristic" },
  CDG: { floor: 170, version: "v1.0", source: "manual_initial_heuristic" },
  MAD: { floor: 165, version: "v1.0", source: "manual_initial_heuristic" },
  BCN: { floor: 160, version: "v1.0", source: "manual_initial_heuristic" },
  LTN: { floor: 175, version: "v1.0", source: "manual_initial_heuristic" },
  DXB: { floor: 200, version: "v1.0", source: "manual_initial_heuristic" },
  HKT: { floor: 580, version: "v1.0", source: "manual_initial_heuristic" },
  MLE: { floor: 620, version: "v1.0", source: "manual_initial_heuristic" },
  DPS: { floor: 680, version: "v1.0", source: "manual_initial_heuristic" },
  BKK: { floor: 500, version: "v1.0", source: "manual_initial_heuristic" },
};

const BALKAN_VIZESIZ = new Set([
  "TIA",
  "SJJ",
  "SKP",
  "BEG",
  "TBS",
  "GYD",
  "SSH",
  "SOF",
  "DXB",
]);

const TROPIK = new Set(["HKT", "MLE", "DPS", "BKK"]);

export function routeLaneForDest(destCode: string): RouteLane {
  const c = destCode.trim().toUpperCase();
  if (TROPIK.has(c)) return "tropik_uzakdogu";
  if (BALKAN_VIZESIZ.has(c)) return "balkan_vizesiz";
  return "schengen_avrupa";
}

export function gateRatioForDest(destCode: string): number {
  switch (routeLaneForDest(destCode)) {
    case "balkan_vizesiz":
      return 0.7;
    case "tropik_uzakdogu":
      return 0.82;
    default:
      return 0.75;
  }
}

/**
 * Elle verilen eşikler (v2, 2026-10-08): fiyat ≤ eşik ise vitrin, üstü hiçbir yoldan
 * (sezonluk / Google ortalaması / eski kart snapshot'ı) girmez.
 */
export const MANUAL_THRESHOLDS: Record<string, number> = {
  AUH: 180,
  AKX: 200,
  KSY: 70,
  ALC: 205,
  BER: 125,
  AER: 300,
  BEG: 140,
  AGP: 200,
  FCO: 170,
  VIE: 120,
  BIO: 183,
  AMM: 220,
  BRE: 140,
  CIT: 220,
  JED: 130,
  BHX: 180,
  BLQ: 180,
  NCE: 160,
  MUC: 140,
  BUD: 100,
  DMM: 220,
  SJJ: 110,
  PMO: 190,
  VLC: 190,
  ALA: 200,
  EDI: 200,
  BSL: 115,
  MLH: 115,
  CAI: 150,
  LTN: 140,
  SKP: 110,
  VCE: 180,
  PRG: 120,
  OVB: 1400,
  CDG: 150,
  VAN: 100,
  MSR: 100,
  DUB: 160,
  BRS: 170,
  GZT: 70,
  BJV: 90,
  KYA: 80,
  BRI: 210,
  PVG: 540,
  SHA: 540,
  BAH: 240,
  BJL: 530,
  CTA: 190,
  BGW: 155,
  KCM: 70,
  BRU: 130,
  CRL: 130,
  ATH: 93,
  CMN: 240,
  AJI: 110,
  SVX: 325,
  LIS: 180,
  SVQ: 180,
  NAP: 170,
  MNL: 500,
};

export function strictThresholdUsd(destCode: string): number | null {
  return MANUAL_THRESHOLDS[destCode.trim().toUpperCase()] ?? null;
}

/**
 * Geçici elle Standart (üstü çizili, USD) — fiyat verisi olmayan şehirler.
 * Medyan / Google ortalaması gibi gerçek referans varsa o kullanılır.
 */
export const MANUAL_STANDARDS: Record<string, number> = {
  LIS: 252,
  SVQ: 252,
  NAP: 245,
  MNL: 700,
};

export function manualStandardUsd(destCode: string): number | null {
  return MANUAL_STANDARDS[destCode.trim().toUpperCase()] ?? null;
}

/** deal-display BOOKING_DISPLAY_FACTOR ile aynı olmalı (döngüsel import yüzünden kopya). */
const STRICT_DISPLAY_FACTOR = 0.97;

/**
 * Elle eşik ekranda görünen fiyata uygulanır: floor(ham × 0.97) ≤ eşik.
 * Ham fiyatla karşılaştırmak için en yüksek geçerli ham fiyat.
 */
export function strictRawCapUsd(destCode: string): number | null {
  const threshold = strictThresholdUsd(destCode);
  if (threshold == null) return null;
  return (threshold + 1) / STRICT_DISPLAY_FACTOR - 1e-6;
}

export function hardFloorUsd(destCode: string): number | null {
  const code = destCode.trim().toUpperCase();
  return strictThresholdUsd(code) ?? HARD_FLOORS[code]?.floor ?? null;
}

/** Sezonluk kapı için minimum sentetik RT aday sayısı (heuristic). */
export function minSampleForDest(destCode: string): number {
  return routeLaneForDest(destCode) === "tropik_uzakdogu" ? 30 : 50;
}

/** Tek taramada şişmeyi önlemek: en az bu kadar farklı gidiş günü. */
export function minDistinctOutboundForDest(destCode: string): number {
  return routeLaneForDest(destCode) === "tropik_uzakdogu" ? 7 : 10;
}
