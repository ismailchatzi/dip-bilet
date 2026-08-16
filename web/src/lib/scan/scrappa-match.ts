import { notifyNewDeals } from "@/lib/notify-new-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import {
  SCRAPPA_DESTINATIONS,
  type ScrappaDestination,
} from "@/lib/scan/scrappa-targets";
import { googleFlightsSearchUrl } from "@/lib/deal-display";
import {
  scrappaRoundTrip,
  ScrappaUnavailableError,
} from "@/lib/providers/scrappa";
import { nightsBetween, stayRange, maxStopsForDest } from "@/lib/scan/trip-rules";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const POST_RATIO = 0.8;
const STRIKE_RATIO = 1.1;
const THRESHOLD_RATIO = 0.9;
const MIN_MEDIAN_SAMPLES = 3;
const MAX_DEALS_PER_DEST = 3;

type Obs = {
  route_key: string;
  season_key: string;
  price: number;
  outbound_date: string;
};

function median(nums: number[]) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function originOf(routeKey: string) {
  return routeKey.split(">")[0] ?? "";
}

function destOf(routeKey: string) {
  return routeKey.split(">")[1] ?? "";
}

function isIstanbul(code: string) {
  return code === "IST" || code === "SAW";
}

/** O gün İstanbul→şehir (veya dönüş) en ucuz tek yön — IST/SAW tek havuz. */
function cityDailyMins(
  rows: Obs[],
  destCode: string,
  direction: "out" | "in",
) {
  const byDate = new Map<string, { price: number; season: string }>();
  for (const r of rows) {
    const from = originOf(r.route_key);
    const to = destOf(r.route_key);
    const ok =
      direction === "out"
        ? isIstanbul(from) && to === destCode
        : from === destCode && isIstanbul(to);
    if (!ok) continue;
    const prev = byDate.get(r.outbound_date);
    if (!prev || r.price < prev.price) {
      byDate.set(r.outbound_date, { price: r.price, season: r.season_key });
    }
  }
  return byDate;
}

function cityMonthlyMedian(
  daily: Map<string, { price: number; season: string }>,
  season: string,
): number | null {
  const prices = [...daily.values()]
    .filter((d) => d.season === season)
    .map((d) => d.price);
  if (prices.length < MIN_MEDIAN_SAMPLES) return null;
  return median(prices);
}

function departureLabel(outOrigin: string, retDest: string) {
  if (outOrigin === retDest) return `İstanbul (${outOrigin})`;
  return `İstanbul (${outOrigin} → ${retDest})`;
}

async function loadObservations(
  admin: SupabaseClient,
  destCode: string,
): Promise<Obs[]> {
  const { data, error } = await admin
    .from("price_observations")
    .select("route_key, season_key, price, outbound_date")
    .eq("destination_code", destCode)
    .eq("source", "scrappa_oneway")
    .not("outbound_date", "is", null)
    .order("outbound_date", { ascending: true })
    .limit(8000);

  if (error || !data) return [];
  return data
    .map((r) => ({
      route_key: String(r.route_key),
      season_key: String(r.season_key),
      price: Number(r.price),
      outbound_date: String(r.outbound_date),
    }))
    .filter(
      (r) =>
        r.route_key.includes(">") &&
        Number.isFinite(r.price) &&
        r.price > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.outbound_date),
    );
}

export function matchDestDeals(
  dest: ScrappaDestination,
  rows: Obs[],
  foundAt = new Date().toISOString(),
): Deal[] {
  const [minNights, maxNights] = stayRange(dest.code);
  const outbound = rows.filter((r) => destOf(r.route_key) === dest.code);
  const inbound = rows.filter((r) => originOf(r.route_key) === dest.code);
  const outDaily = cityDailyMins(rows, dest.code, "out");
  const inDaily = cityDailyMins(rows, dest.code, "in");

  type Best = {
    total: number;
    out: Obs;
    ret: Obs;
  };
  const cheapestPair = new Map<string, Best>();

  for (const out of outbound) {
    if (!isIstanbul(originOf(out.route_key))) continue;
    for (const ret of inbound) {
      if (!isIstanbul(destOf(ret.route_key))) continue;
      const nights = nightsBetween(out.outbound_date, ret.outbound_date);
      if (nights < minNights || nights > maxNights) continue;
      const total = out.price + ret.price;
      const key = `${out.outbound_date}|${ret.outbound_date}`;
      const prev = cheapestPair.get(key);
      if (!prev || total < prev.total) {
        cheapestPair.set(key, { total, out, ret });
      }
    }
  }

  type Combo = Deal & { realDiscount: number };
  const combos: Combo[] = [];

  for (const { total, out, ret } of cheapestPair.values()) {
    const outMed = cityMonthlyMedian(outDaily, out.season_key);
    const inRaw = cityMonthlyMedian(inDaily, ret.season_key);
    if (outMed == null || inRaw == null) continue;
    const outForReturnMonth =
      cityMonthlyMedian(outDaily, ret.season_key) ?? outMed;
    const retMed = Math.min(inRaw, outForReturnMonth * 1.15);

    const m = outMed + retMed;
    if (m <= 0 || total > m * POST_RATIO) continue;

    const outOrigin = originOf(out.route_key);
    const retDest = destOf(ret.route_key);
    const strike = Math.round(m * STRIKE_RATIO);
    const threshold = Math.round(m * THRESHOLD_RATIO);
    const displayOff = Math.round(((strike - total) / strike) * 100);
    const realOff = Math.round(((m - total) / m) * 100);

    combos.push({
      id: `scrappa:${dest.code}:${outOrigin}:${out.outbound_date}:${retDest}:${ret.outbound_date}`,
      destination: `${dest.name} (${dest.code})`,
      price: Math.round(total),
      averagePrice: strike,
      thresholdPrice: threshold,
      discountPercent: displayOff,
      currency: "USD",
      outboundDate: out.outbound_date,
      returnDate: ret.outbound_date,
      googleFlightsUrl: googleFlightsSearchUrl(
        outOrigin,
        dest.code,
        out.outbound_date,
        retDest,
        ret.outbound_date,
      ),
      departureLabel: departureLabel(outOrigin, retDest),
      foundAt,
      realDiscount: realOff,
    });
  }

  const bestById = new Map<string, Combo>();
  for (const c of combos) {
    const prev = bestById.get(c.id);
    if (!prev || c.price < prev.price) bestById.set(c.id, c);
  }

  return [...bestById.values()]
    .sort((a, b) => b.realDiscount - a.realDiscount || a.price - b.price)
    .slice(0, MAX_DEALS_PER_DEST)
    .map(({ realDiscount: _, ...deal }) => deal);
}

async function verifyWithRoundTrip(deal: Deal, destCode: string): Promise<Deal | null> {
  const outDate = deal.outboundDate;
  const retDate = deal.returnDate;
  if (!outDate || !retDate) return null;
  const m =
    typeof deal.thresholdPrice === "number"
      ? deal.thresholdPrice / THRESHOLD_RATIO
      : null;
  let best: {
    origin: "IST" | "SAW";
    price: number;
    airline?: string;
    stops?: number;
    selfTransfer?: boolean;
  } | null = null;
  for (const origin of ["SAW", "IST"] as const) {
    try {
      const hit = await scrappaRoundTrip({
        origin,
        destination: destCode,
        departureDate: outDate,
        returnDate: retDate,
      });
      if (!hit) continue;
      if (!best || hit.price < best.price) {
        best = {
          origin,
          price: hit.price,
          airline: hit.airline,
          stops: hit.stops,
          selfTransfer: hit.selfTransfer,
        };
      }
    } catch (err) {
      if (err instanceof ScrappaUnavailableError) throw err;
    }
  }
  if (!best) return null;
  if (typeof best.stops === "number" && best.stops > maxStopsForDest(destCode)) {
    return null;
  }
  if (m != null && best.price > m * POST_RATIO) return null;
  const strike = deal.averagePrice ?? Math.round((m ?? best.price) * STRIKE_RATIO);
  const displayOff = Math.round(((strike - best.price) / strike) * 100);
  return {
    ...deal,
    id: `scrappa:${destCode}:${best.origin}:${outDate}:${best.origin}:${retDate}`,
    price: Math.round(best.price),
    discountPercent: displayOff,
    airline: best.airline,
    stops: best.stops,
    selfTransfer: best.selfTransfer,
    googleFlightsUrl: googleFlightsSearchUrl(
      best.origin,
      destCode,
      outDate,
      best.origin,
      retDate,
    ),
    departureLabel: departureLabel(best.origin, best.origin),
  };
}

export async function matchDestFromDb(
  admin: SupabaseClient,
  dest: ScrappaDestination,
): Promise<Deal[]> {
  const rows = await loadObservations(admin, dest.code);
  const drafts = matchDestDeals(dest, rows);
  const verified: Deal[] = [];
  for (const deal of drafts) {
    try {
      const next = await verifyWithRoundTrip(deal, dest.code);
      if (next) verified.push(next);
    } catch (err) {
      if (err instanceof ScrappaUnavailableError) break;
      throw err;
    }
  }
  return verified;
}

function destCodeFromDeal(deal: Deal) {
  if (deal.id.startsWith("scrappa:") || deal.id.startsWith("gdeals:")) {
    return deal.id.split(":")[1] ?? "";
  }
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

function isGoogleDeal(deal: Deal) {
  return deal.id.startsWith("gdeals:");
}

function tripKey(deal: Deal) {
  return `${destCodeFromDeal(deal)}|${deal.outboundDate ?? ""}|${deal.returnDate ?? ""}`;
}

/** Bir varışın vitrin kartlarını günceller, diğer şehirleri korur */
export async function publishDestShowcase(
  admin: SupabaseClient,
  dest: ScrappaDestination,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const fresh = await matchDestFromDb(admin, dest);
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const others = previous.filter(
    (d) => isGoogleDeal(d) || destCodeFromDeal(d) !== dest.code,
  );
  const taken = new Set(others.map(tripKey));
  const deals = [...others, ...fresh.filter((d) => !taken.has(tripKey(d)))];
  const { payload, live, previousLive } = foldShowcase(board.deals, deals);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, count: 0, error: saved.error };
  await notifyNewDeals(admin, previousLive, live);
  return { ok: true, count: fresh.length };
}

/** Tüm varışları yeniden eşleştirir */
export async function publishAllShowcase(
  admin: SupabaseClient,
  opts?: { notify?: boolean },
): Promise<{ ok: boolean; count: number; error?: string }> {
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const googleKept = previous.filter(isGoogleDeal);
  const taken = new Set(googleKept.map(tripKey));
  const all: Deal[] = [...googleKept];
  for (const dest of SCRAPPA_DESTINATIONS) {
    const fresh = await matchDestFromDb(admin, dest);
    console.log(`rematch ${dest.code} scrappa=${fresh.length}`);
    for (const deal of fresh) {
      const key = tripKey(deal);
      if (taken.has(key)) continue;
      taken.add(key);
      all.push(deal);
    }
  }
  const { payload, live, previousLive } = foldShowcase(board.deals, all);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, count: 0, error: saved.error };
  if (opts?.notify !== false) {
    await notifyNewDeals(admin, previousLive, live);
  }
  return { ok: true, count: live.length };
}
