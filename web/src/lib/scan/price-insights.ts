export type PriceLevel = "low" | "typical" | "high";

export type ParsedInsights = {
  averagePrice?: number;
  discountPercent?: number;
  priceLevel?: PriceLevel;
};

function asPriceLevel(raw: unknown): PriceLevel | undefined {
  if (raw === "low" || raw === "typical" || raw === "high") return raw;
  return undefined;
}

function midOfRange(low?: number, high?: number): number | undefined {
  if (typeof low === "number" && typeof high === "number" && high > 0) {
    return (low + high) / 2;
  }
  return undefined;
}

/**
 * SerpApi: typical_price_range = [low, high]
 * SearchApi: typical_price_range = { low_price, high_price } veya [low, high]
 */
export function parsePriceInsights(
  insights: unknown,
  currentPrice: number,
): ParsedInsights {
  if (!insights || typeof insights !== "object") return {};

  const i = insights as {
    price_level?: unknown;
    typical_price_range?:
      | number[]
      | { low_price?: number; high_price?: number; low?: number; high?: number };
    lowest_price?: number;
  };

  const priceLevel = asPriceLevel(i.price_level);
  let low: number | undefined;
  let high: number | undefined;
  const range = i.typical_price_range;

  if (Array.isArray(range) && range.length >= 2) {
    low = range[0];
    high = range[1];
  } else if (range && typeof range === "object" && !Array.isArray(range)) {
    low = range.low_price ?? range.low;
    high = range.high_price ?? range.high;
  }

  const averagePrice = midOfRange(low, high);
  const discountPercent =
    averagePrice && averagePrice > 0 && currentPrice > 0
      ? Math.round(((averagePrice - currentPrice) / averagePrice) * 100)
      : undefined;

  return { averagePrice, discountPercent, priceLevel };
}

/**
 * Google price_level=low → en az minDiscount kadar dip say.
 * Range’den gelen % varsa büyüğünü al.
 */
export function applyPriceLevelFloor(
  discountPercent: number | undefined,
  priceLevel: PriceLevel | undefined,
  minDiscount: number,
): number | undefined {
  if (priceLevel === "low") {
    return Math.max(discountPercent ?? 0, minDiscount);
  }
  return discountPercent;
}
