import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScannedFare } from "@/lib/scan/dates";
import { routeKey, seasonKey } from "@/lib/scan/dates";
import type { Deal } from "@/lib/types";

export type ObservationRow = {
  route_key: string;
  season_key: string;
  destination_code: string | null;
  destination_name: string;
  price: number;
  currency: string;
  outbound_date: string | null;
  return_date: string | null;
  source: string;
  discount_percent: number | null;
  average_price: number | null;
};

export function dealToObservation(
  deal: Deal,
  source = "serpapi_deals",
): ObservationRow {
  const code = deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? null;
  return {
    route_key: code ? routeKey(code) : `DEALS>${deal.destination}`,
    season_key: seasonKey(),
    destination_code: code,
    destination_name: deal.destination,
    price: deal.price,
    currency: deal.currency || "TRY",
    outbound_date: deal.outboundDate ?? null,
    return_date: deal.returnDate ?? null,
    source,
    discount_percent: deal.discountPercent ?? null,
    average_price: deal.averagePrice ?? null,
  };
}

export function fareToObservation(fare: ScannedFare): ObservationRow {
  return {
    route_key: routeKey(fare.destinationCode),
    season_key: seasonKey(),
    destination_code: fare.destinationCode,
    destination_name: fare.destinationName,
    price: fare.price,
    currency: fare.currency || "TRY",
    outbound_date: fare.outboundDate,
    return_date: fare.returnDate,
    source: fare.provider,
    discount_percent: fare.discountPercent ?? null,
    average_price: fare.averagePrice ?? null,
  };
}

export async function insertObservations(
  admin: SupabaseClient,
  rows: ObservationRow[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  const { error } = await admin.from("price_observations").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Rota+sezon ortalaması; en az minSamples gözlem */
export async function ownRouteAverage(
  admin: SupabaseClient,
  destinationCode: string,
  minSamples = 5,
): Promise<number | null> {
  const rk = routeKey(destinationCode);
  const sk = seasonKey();
  const { data, error } = await admin
    .from("price_observations")
    .select("price")
    .eq("route_key", rk)
    .eq("season_key", sk)
    .limit(200);

  if (error || !data || data.length < minSamples) return null;
  const sum = data.reduce((acc, r) => acc + Number(r.price), 0);
  return sum / data.length;
}

export function discountFromAverage(
  price: number,
  average: number | null | undefined,
): number | undefined {
  if (!average || average <= 0) return undefined;
  return Math.round(((average - price) / average) * 100);
}

/** Google % yoksa kendi ortalamayı kullan; ikisi varsa yüksek olanı al */
export function hybridDiscount(
  price: number,
  googleDiscount?: number,
  googleAverage?: number,
  ownAverage?: number | null,
): { discountPercent?: number; averagePrice?: number } {
  const fromGoogle =
    typeof googleDiscount === "number"
      ? googleDiscount
      : discountFromAverage(price, googleAverage);
  const fromOwn = discountFromAverage(price, ownAverage ?? undefined);

  const candidates = [fromGoogle, fromOwn].filter(
    (n): n is number => typeof n === "number",
  );
  if (candidates.length === 0) {
    return {
      averagePrice: ownAverage ?? googleAverage,
    };
  }

  const best = Math.max(...candidates);
  const averagePrice =
    fromOwn === best && ownAverage
      ? ownAverage
      : (googleAverage ?? ownAverage ?? undefined);

  return { discountPercent: best, averagePrice };
}
