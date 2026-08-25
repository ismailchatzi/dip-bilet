import {
  BENCHMARK_MODE,
  GOOGLE_AVG_GATE,
  gateRatioForDest,
  hardFloorUsd,
  minDistinctOutboundForDest,
  minSampleForDest,
  strikeFromThreshold,
  type DealBadge,
} from "@/lib/scan/showcase-config";

export type EligibilityOk = {
  isEligible: true;
  badge: DealBadge;
  /** Kartta gösterilen eşik = gerçek kapı */
  uiThreshold: number;
  /** Üstü çizili referans */
  strikePrice: number;
  monthlyMedian: number | null;
  benchmarkMode: typeof BENCHMARK_MODE;
};

export type EligibilityNo = {
  isEligible: false;
  reason: string;
};

export type EligibilityResult = EligibilityOk | EligibilityNo;

export type MonthSampleStats = {
  /** Sentetik RT aday (gidiş+dönüş toplam) sayısı */
  sampleCount: number;
  distinctOutboundDays: number;
  /** Sentetik RT toplamlarının medyanı */
  median: number | null;
};

function median(nums: number[]) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function monthStatsFromTotals(
  totals: number[],
  outboundDates: string[],
): MonthSampleStats {
  const distinct = new Set(outboundDates.filter(Boolean));
  return {
    sampleCount: totals.length,
    distinctOutboundDays: distinct.size,
    median: median(totals.filter((n) => Number.isFinite(n) && n > 0)),
  };
}

export function seasonalGateOpen(
  destCode: string,
  stats: MonthSampleStats,
): boolean {
  if (stats.sampleCount < minSampleForDest(destCode)) return false;
  if (stats.distinctOutboundDays < minDistinctOutboundForDest(destCode)) {
    return false;
  }
  if (stats.median == null || !(stats.median > 0)) return false;
  return true;
}

/**
 * Paket (veya aday) fiyatı vitrine girer mi?
 * MUTLAK_FIRSAT, SEZONLUK_DIP'i ezer.
 */
export function checkShowcaseEligibility(input: {
  destCode: string;
  packagePrice: number;
  monthStats: MonthSampleStats;
}): EligibilityResult {
  const price = input.packagePrice;
  if (!Number.isFinite(price) || price <= 0) {
    return { isEligible: false, reason: "fiyat_yok" };
  }

  const floor = hardFloorUsd(input.destCode);
  if (floor != null && price <= floor) {
    return {
      isEligible: true,
      badge: "MUTLAK_FIRSAT",
      uiThreshold: floor,
      strikePrice: strikeFromThreshold(floor, input.monthStats.median),
      monthlyMedian: input.monthStats.median,
      benchmarkMode: BENCHMARK_MODE,
    };
  }

  if (!seasonalGateOpen(input.destCode, input.monthStats)) {
    return { isEligible: false, reason: "sezonluk_kapali_veya_floor_ustu" };
  }

  const m = input.monthStats.median!;
  const ratio = gateRatioForDest(input.destCode);
  const seasonalThreshold = m * ratio;
  if (price <= seasonalThreshold) {
    const uiThreshold = Math.round(seasonalThreshold);
    return {
      isEligible: true,
      badge: "SEZONLUK_DIP",
      uiThreshold,
      strikePrice: strikeFromThreshold(uiThreshold, m),
      monthlyMedian: m,
      benchmarkMode: BENCHMARK_MODE,
    };
  }

  return { isEligible: false, reason: "sezonluk_ustu" };
}

/** Doğrulama kuyruğuna almak için gevşek ön eleme (paket biraz düşebilir). */
export function isVerifyCandidate(input: {
  destCode: string;
  syntheticTotal: number;
  monthStats: MonthSampleStats;
}): boolean {
  const floor = hardFloorUsd(input.destCode);
  if (floor != null && input.syntheticTotal <= floor * 1.08) return true;
  const el = checkShowcaseEligibility({
    destCode: input.destCode,
    packagePrice: input.syntheticTotal,
    monthStats: input.monthStats,
  });
  return el.isEligible;
}

/** SerpAPI / Google Deals kalite süzgeci */
export function passesGoogleShowcaseGate(input: {
  destCode: string;
  price: number;
  googleAverage?: number;
}): EligibilityResult {
  const floor = hardFloorUsd(input.destCode);
  if (floor != null && input.price <= floor) {
    const avg = input.googleAverage;
    return {
      isEligible: true,
      badge: "MUTLAK_FIRSAT",
      uiThreshold: floor,
      strikePrice: strikeFromThreshold(floor, avg),
      monthlyMedian: null,
      benchmarkMode: BENCHMARK_MODE,
    };
  }

  const avg = input.googleAverage;
  if (avg == null || !Number.isFinite(avg) || avg <= 0) {
    return { isEligible: false, reason: "google_avg_yok" };
  }
  const threshold = avg * GOOGLE_AVG_GATE;
  if (input.price <= threshold) {
    const uiThreshold = Math.round(threshold);
    return {
      isEligible: true,
      badge: "SEZONLUK_DIP",
      uiThreshold,
      strikePrice: strikeFromThreshold(uiThreshold, avg),
      monthlyMedian: avg,
      benchmarkMode: BENCHMARK_MODE,
    };
  }
  return { isEligible: false, reason: "google_gate_ustu" };
}
