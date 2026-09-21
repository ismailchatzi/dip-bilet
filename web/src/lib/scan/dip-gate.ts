import type { Deal } from "@/lib/types";
import { hardFloorUsd } from "@/lib/scan/showcase-config";

function destCodeOf(deal: Deal) {
  if (
    deal.id.startsWith("scrappa:") ||
    deal.id.startsWith("gdeals:") ||
    deal.id.startsWith("manual:")
  ) {
    return deal.id.split(":")[1] ?? "";
  }
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

/**
 * Vitrin fiyat kapısı — kaynak fark etmez (scrappa / gdeals / manual).
 * Snapshot thresholdPrice; yoksa hard floor; ikisi de yoksa kapı yok.
 */
export function dealPriceCapUsd(deal: Deal): number | null {
  if (typeof deal.thresholdPrice === "number" && deal.thresholdPrice > 0) {
    return deal.thresholdPrice;
  }
  const floor = hardFloorUsd(destCodeOf(deal));
  return floor != null && floor > 0 ? floor : null;
}

/** Fiyat eşiğin (veya floor’un) üstünde olamaz. */
export function passesDealThresholdGate(deal: Deal) {
  const cap = dealPriceCapUsd(deal);
  if (cap == null) return true;
  return Number.isFinite(deal.price) && deal.price > 0 && deal.price <= cap;
}

export function dropOverThresholdDeals(deals: Deal[]) {
  return deals.filter(passesDealThresholdGate);
}

/** @deprecated → passesDealThresholdGate */
export function passesScrappaDipGate(deal: Deal) {
  if (!deal.id.startsWith("scrappa:")) return true;
  return passesDealThresholdGate(deal);
}

/** @deprecated → dropOverThresholdDeals */
export function dropFailedScrappaDips(deals: Deal[]) {
  return dropOverThresholdDeals(deals);
}

/** @deprecated Prod’da da aynı kapı; localhost ayrımı kalktı. */
export function dropFailedScrappaDipsOnLocalhost(deals: Deal[]) {
  return dropOverThresholdDeals(deals);
}
