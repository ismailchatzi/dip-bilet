import type { Deal } from "@/lib/types";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";

const POST_NEAR = 0.7;
const POST_FAR = 0.75;
const NEAR_DAYS = 21;
const THRESHOLD_RATIO = 0.9;

function postRatioForOutbound(outDate: string, today = turkeyTodayIso()) {
  const nearEnd = addDaysIso(today, NEAR_DAYS);
  return outDate <= nearEnd ? POST_NEAR : POST_FAR;
}

/** Scrappa: paket o ay medyanının %30/%25 altında mı? Taban kartlar hayır. */
export function passesScrappaDipGate(deal: Deal, today = turkeyTodayIso()) {
  if (!deal.id.startsWith("scrappa:")) return true;
  const threshold = deal.thresholdPrice;
  if (typeof threshold !== "number" || threshold <= 0) return true;
  const m = threshold / THRESHOLD_RATIO;
  const out = deal.outboundDate;
  if (!out) return true;
  return deal.price <= m * postRatioForOutbound(out, today);
}

export function dropFailedScrappaDips(deals: Deal[]) {
  return deals.filter((d) => passesScrappaDipGate(d));
}

/** Prod vitrinini bozma — paylaşılan Supabase. Yalnız next dev. */
export function dropFailedScrappaDipsOnLocalhost(deals: Deal[]) {
  if (process.env.NODE_ENV === "production") return deals;
  return dropFailedScrappaDips(deals);
}
