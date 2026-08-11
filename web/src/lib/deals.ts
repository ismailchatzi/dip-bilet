import { getDemoDeals } from "./demo-deals";
import { readDealsCache, writeDealsCache } from "./cache";
import { serpapiDealsBundle } from "@/lib/providers/serpapi";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import type { Deal, DealsPayload } from "./types";

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function fetchSerpDeals(): Promise<DealsPayload> {
  const { departureLabel, deals: raw } = await serpapiDealsBundle();
  const minDiscount = envNumber("MIN_DISCOUNT_PERCENT", 30);
  const label = departureLabel || DEPARTURE_LABEL;

  const deals: Deal[] = [];
  for (const [index, d] of raw.entries()) {
    if (typeof d.price !== "number") continue;
    if ((d.discountPercent ?? 0) < minDiscount) continue;
    const destLabel = d.destinationCode
      ? `${d.destination} (${d.destinationCode})`
      : d.destination;
    deals.push({
      id: `${d.destinationCode ?? d.destination}-${d.outboundDate ?? index}-${d.price}`,
      destination: destLabel,
      country: d.country,
      price: d.price,
      averagePrice: d.averagePrice,
      discountPercent: d.discountPercent,
      currency: "TRY",
      outboundDate: d.outboundDate,
      returnDate: d.returnDate,
      airline: d.airline,
      stops: d.stops,
      googleFlightsUrl: d.googleFlightsUrl,
      departureLabel: label,
    });
  }

  deals.sort(
    (a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
  );

  const payload: DealsPayload = {
    source: "serpapi",
    fetchedAt: new Date().toISOString(),
    departure: label,
    deals,
  };

  if (deals.length === 0) {
    payload.warning =
      "Tarama tamam ama eşiğin üzerinde dip fırsat çıkmadı. Filtreyi düşürmek veya sonra tekrar denemek gerekebilir.";
  }

  return payload;
}

/**
 * Going tarzı: IST/SAW Deals (hafta + weekend birleşik).
 * Cache sayesinde her sayfa yenilemesi kota yakmaz.
 */
export async function getDeals(options?: {
  forceRefresh?: boolean;
}): Promise<DealsPayload> {
  const cacheHours = envNumber("DEALS_CACHE_HOURS", 12);
  const apiKey = process.env.SERPAPI_API_KEY?.trim();

  if (!options?.forceRefresh) {
    const cached = await readDealsCache(cacheHours);
    if (cached) return cached;
  }

  if (!apiKey) {
    return getDemoDeals();
  }

  try {
    const fresh = await fetchSerpDeals();
    await writeDealsCache(fresh);
    return fresh;
  } catch (err) {
    const cached = await readDealsCache(cacheHours * 7);
    if (cached) {
      return {
        ...cached,
        source: "cache",
        warning: `Canlı tarama başarısız, eski cache gösteriliyor. (${err instanceof Error ? err.message : "hata"})`,
      };
    }

    const demo = getDemoDeals();
    return {
      ...demo,
      warning: `Canlı tarama başarısız, demo veri. (${err instanceof Error ? err.message : "hata"})`,
    };
  }
}
