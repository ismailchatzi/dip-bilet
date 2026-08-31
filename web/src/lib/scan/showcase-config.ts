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
  PRG: { floor: 150, version: "v1.0", source: "manual_initial_heuristic" },
  FCO: { floor: 150, version: "v1.0", source: "manual_initial_heuristic" },
  VCE: { floor: 145, version: "v1.0", source: "manual_initial_heuristic" },
  MUC: { floor: 155, version: "v1.0", source: "manual_initial_heuristic" },
  BER: { floor: 140, version: "v1.0", source: "manual_initial_heuristic" },
  CDG: { floor: 170, version: "v1.0", source: "manual_initial_heuristic" },
  MAD: { floor: 165, version: "v1.0", source: "manual_initial_heuristic" },
  BCN: { floor: 160, version: "v1.0", source: "manual_initial_heuristic" },
  HKT: { floor: 580, version: "v1.0", source: "manual_initial_heuristic" },
  MLE: { floor: 620, version: "v1.0", source: "manual_initial_heuristic" },
  DPS: { floor: 680, version: "v1.0", source: "manual_initial_heuristic" },
};

const BALKAN_VIZESIZ = new Set([
  "TIA",
  "SJJ",
  "SKP",
  "BEG",
  "TBS",
  "GYD",
  "SSH",
]);

const TROPIK = new Set(["HKT", "MLE", "DPS"]);

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

export function hardFloorUsd(destCode: string): number | null {
  const e = HARD_FLOORS[destCode.trim().toUpperCase()];
  return e?.floor ?? null;
}

/** Sezonluk kapı için minimum sentetik RT aday sayısı (heuristic). */
export function minSampleForDest(destCode: string): number {
  return routeLaneForDest(destCode) === "tropik_uzakdogu" ? 30 : 50;
}

/** Tek taramada şişmeyi önlemek: en az bu kadar farklı gidiş günü. */
export function minDistinctOutboundForDest(destCode: string): number {
  return routeLaneForDest(destCode) === "tropik_uzakdogu" ? 7 : 10;
}
