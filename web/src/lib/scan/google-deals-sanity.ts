import type { SupabaseClient } from "@supabase/supabase-js";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";

/**
 * Google Deals bazen tek yön fiyatını gidiş-dönüş diye verir (ör. FRA 66$ = gidiş tek yönü).
 * Takip edilen şehirlerde aynı tarihlerin kendi tek yön toplamımızla karşılaştırırız.
 */
export const OWN_ONE_WAY_SUM_FLOOR = 0.75;
const OBS_MAX_AGE_DAYS = 21;

async function latestOneWay(
  admin: SupabaseClient,
  routeKey: string,
  day: string,
  sinceIso: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("price_observations")
    .select("price")
    .eq("route_key", routeKey)
    .eq("outbound_date", day)
    .eq("source", "scrappa_oneway")
    .gte("observed_at", sinceIso)
    .order("observed_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  const price = Number(data[0].price);
  return price > 0 ? price : null;
}

export type OwnPriceCheck = { ok: boolean; ownSum: number | null };

/** Veri yoksa geçer; yalnız kendi toplamımızın %75'inin altındaysa düşer. */
export async function checkAgainstOwnOneWays(
  admin: SupabaseClient,
  input: {
    destCode: string;
    airport?: string;
    origin: string;
    outDate: string;
    retDate: string;
    price: number;
  },
  now = new Date(),
): Promise<OwnPriceCheck> {
  if (!findTrackedDestination(input.destCode)) return { ok: true, ownSum: null };
  const airport = (input.airport || input.destCode).toUpperCase();
  const since = new Date(now.getTime() - OBS_MAX_AGE_DAYS * 86_400_000).toISOString();
  const [out, ret] = await Promise.all([
    latestOneWay(admin, `${input.origin}>${airport}`, input.outDate, since),
    latestOneWay(admin, `${airport}>${input.origin}`, input.retDate, since),
  ]);
  if (out === null || ret === null) return { ok: true, ownSum: null };
  const ownSum = out + ret;
  return { ok: input.price >= ownSum * OWN_ONE_WAY_SUM_FLOOR, ownSum };
}
