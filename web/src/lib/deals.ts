import { readDealsCache } from "./cache";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import type { DealsPayload } from "./types";

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Panel: sadece cache / scan_board. SerpApi yok. */
export async function getDeals(): Promise<DealsPayload> {
  const cacheHours = envNumber("DEALS_CACHE_HOURS", 12);
  const cached = await readDealsCache(cacheHours * 14);
  if (cached) return cached;
  return {
    source: "cache",
    fetchedAt: new Date().toISOString(),
    departure: DEPARTURE_LABEL,
    deals: [],
  };
}
