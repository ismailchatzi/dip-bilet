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

/** Kartta üstü çizili ≈ eşik × 1.10 */
export const STRIKE_RATIO = 1.1;

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
  SSH: { floor: 160, version: "v1.0", source: "manual_initial_heuristic" },
  ATH: { floor: 110, version: "v1.0", source: "manual_initial_heuristic" },
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
