import type { Deal } from "@/lib/types";
import { dealDestCode } from "@/lib/deal-display";
import { postRatioForOutbound } from "@/lib/scan/trip-rules";

const THRESHOLD_RATIO = 0.9;

/** Scrappa: paket o ay medyanının kapı oranının altında mı? Taban kartlar hayır. */
export function passesScrappaDipGate(deal: Deal) {
  if (!deal.id.startsWith("scrappa:")) return true;
  const threshold = deal.thresholdPrice;
  if (typeof threshold !== "number" || threshold <= 0) return true;
  const m = threshold / THRESHOLD_RATIO;
  const out = deal.outboundDate;
  if (!out) return true;
  return deal.price <= m * postRatioForOutbound(out, dealDestCode(deal));
}

export function dropFailedScrappaDips(deals: Deal[]) {
  return deals.filter((d) => passesScrappaDipGate(d));
}

/** Prod vitrinini bozma — paylaşılan Supabase. Yalnız next dev. */
export function dropFailedScrappaDipsOnLocalhost(deals: Deal[]) {
  if (process.env.NODE_ENV === "production") return deals;
  return dropFailedScrappaDips(deals);
}
