import type { Deal } from "@/lib/types";
import { dealDestCode } from "@/lib/deal-display";
import { hardFloorUsd } from "@/lib/scan/showcase-config";

/**
 * Scrappa kartı hâlâ kapıya uyuyor mu?
 * Eşik snapshot’ı thresholdPrice; yoksa hard floor.
 */
export function passesScrappaDipGate(deal: Deal) {
  if (!deal.id.startsWith("scrappa:")) return true;
  const code = dealDestCode(deal);
  const floor = hardFloorUsd(code);
  if (typeof deal.thresholdPrice === "number" && deal.thresholdPrice > 0) {
    return deal.price <= deal.thresholdPrice;
  }
  if (floor != null) return deal.price <= floor;
  return true;
}

export function dropFailedScrappaDips(deals: Deal[]) {
  return deals.filter((d) => passesScrappaDipGate(d));
}

/** Prod vitrinini bozma — paylaşılan Supabase. Yalnız next dev. */
export function dropFailedScrappaDipsOnLocalhost(deals: Deal[]) {
  if (process.env.NODE_ENV === "production") return deals;
  return dropFailedScrappaDips(deals);
}
