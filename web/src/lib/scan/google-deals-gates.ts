import { isLongHaulDest, postRatioForOutbound } from "@/lib/scan/trip-rules";
import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_MEDIAN_SAMPLES = 3;
const MIN_AVG_DISCOUNT = 0.2;

function median(nums: number[]) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function isIstanbul(code: string) {
  return code === "IST" || code === "SAW";
}

/** USD tavan — Avrupa/yakın vs uzak. */
export function googleDealPriceCeilingUsd(destCode: string) {
  if (isLongHaulDest(destCode)) return 800;
  return 450;
}

/**
 * 1) Google avg şart + en az %20 altı
 * 2) Tavan fiyat
 * 3) Scrappa şehir medyanı M varsa paket ≤ M × kapı (uzak doğu 0.90/0.95, diğer 0.70/0.75)
 */
export function passesGoogleDealGates(input: {
  price: number;
  average?: number;
  destCode: string;
  outDate: string;
  scrappaM?: number | null;
}): { ok: true } | { ok: false; reason: string } {
  const avg = input.average;
  if (avg == null || !Number.isFinite(avg) || avg <= 0) {
    return { ok: false, reason: "google_avg_yok" };
  }
  if (input.price >= avg) {
    return { ok: false, reason: "avg_ustu" };
  }
  if (input.price > avg * (1 - MIN_AVG_DISCOUNT)) {
    return { ok: false, reason: "indirim_az" };
  }

  const cap = googleDealPriceCeilingUsd(input.destCode);
  if (input.price > cap) {
    return { ok: false, reason: "tavan" };
  }

  const m = input.scrappaM;
  if (m != null && Number.isFinite(m) && m > 0) {
    const ratio = postRatioForOutbound(input.outDate, input.destCode);
    if (input.price > m * ratio) {
      return { ok: false, reason: "scrappa_medyan" };
    }
  }

  return { ok: true };
}

/** Gidiş ayı için şehir paketi medyanı (gidiş+tavanlı dönüş), yoksa null. */
export async function scrappaCityPackageMedian(
  admin: SupabaseClient,
  destCode: string,
  seasonKey: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("price_observations")
    .select("route_key, price, outbound_date, season_key")
    .eq("destination_code", destCode)
    .eq("source", "scrappa_oneway")
    .eq("season_key", seasonKey)
    .not("outbound_date", "is", null)
    .limit(4000);

  if (error || !data?.length) return null;

  const outDaily = new Map<string, number>();
  const inDaily = new Map<string, number>();
  for (const row of data) {
    const rk = String(row.route_key ?? "");
    const [from, to] = rk.split(">");
    const price = Number(row.price);
    const day = String(row.outbound_date ?? "");
    if (!from || !to || !day || !Number.isFinite(price) || price <= 0) continue;
    if (isIstanbul(from) && to === destCode) {
      const prev = outDaily.get(day);
      if (prev == null || price < prev) outDaily.set(day, price);
    } else if (from === destCode && isIstanbul(to)) {
      const prev = inDaily.get(day);
      if (prev == null || price < prev) inDaily.set(day, price);
    }
  }

  const outPrices = [...outDaily.values()];
  const inPrices = [...inDaily.values()];
  if (outPrices.length < MIN_MEDIAN_SAMPLES || inPrices.length < MIN_MEDIAN_SAMPLES) {
    return null;
  }
  const outMed = median(outPrices);
  const inRaw = median(inPrices);
  return outMed + Math.min(inRaw, outMed * 1.15);
}
