import { notifyNewDeals } from "@/lib/notify-new-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import {
  SCRAPPA_DESTINATIONS,
  type ScrappaDestination,
} from "@/lib/scan/scrappa-targets";
import { googleFlightsSearchUrl, isUnverifiedOneWaySum } from "@/lib/deal-display";
import {
  scrappaCheapestBookingPrice,
  scrappaRoundTrip,
  ScrappaUnavailableError,
} from "@/lib/providers/scrappa";
import { nightsBetween, stayRange, maxStopsForDest, turkeyTodayIso, addDaysIso } from "@/lib/scan/trip-rules";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 3 hafta: paket ≤ M × 0.70 (%30 altı). 6 ay: ≤ M × 0.75 (%25 altı). */
const POST_NEAR = 0.7;
const POST_FAR = 0.75;
const NEAR_DAYS = 21;
const STRIKE_RATIO = 1.1;
const THRESHOLD_RATIO = 0.9;
const MIN_MEDIAN_SAMPLES = 3;
const MAX_DIP_DEALS = 2;

type Obs = {
  route_key: string;
  season_key: string;
  price: number;
  outbound_date: string;
  airline?: string;
  stops?: number;
  self_transfer?: boolean;
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
  const full = await admin
    .from("price_observations")
    .select(
      "route_key, season_key, price, outbound_date, airline, stops, self_transfer",
    )
    .eq("destination_code", destCode)
    .eq("source", "scrappa_oneway")
    .not("outbound_date", "is", null)
    .order("outbound_date", { ascending: true })
    .limit(8000);

  const { data, error } =
    full.error && /airline|stops|self_transfer|schema cache/i.test(full.error.message)
      ? await admin
          .from("price_observations")
          .select("route_key, season_key, price, outbound_date")
          .eq("destination_code", destCode)
          .eq("source", "scrappa_oneway")
          .not("outbound_date", "is", null)
          .order("outbound_date", { ascending: true })
          .limit(8000)
      : full;

  if (error || !data) return [];
  return data
    .map((r) => {
      const row = r as {
        route_key: unknown;
        season_key: unknown;
        price: unknown;
        outbound_date: unknown;
        airline?: unknown;
        stops?: unknown;
        self_transfer?: unknown;
      };
      return {
        route_key: String(row.route_key),
        season_key: String(row.season_key),
        price: Number(row.price),
        outbound_date: String(row.outbound_date),
        airline:
          typeof row.airline === "string" && row.airline.trim()
            ? row.airline.trim()
            : undefined,
        stops: typeof row.stops === "number" ? row.stops : undefined,
        self_transfer: row.self_transfer === true ? true : undefined,
      };
    })
    .filter(
      (r) =>
        r.route_key.includes(">") &&
        Number.isFinite(r.price) &&
        r.price > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.outbound_date),
    );
}

function postRatioForOutbound(outDate: string, today = turkeyTodayIso()) {
  const nearEnd = addDaysIso(today, NEAR_DAYS);
  return outDate <= nearEnd ? POST_NEAR : POST_FAR;
}

type Pair = {
  total: number;
  out: Obs;
  ret: Obs;
};

type Draft = Deal & { realDiscount: number; postRatio: number };

function comboFromPair(
  dest: ScrappaDestination,
  pair: Pair,
  m: number,
  foundAt: string,
  postRatio: number,
): Draft {
  const { total, out, ret } = pair;
  const outOrigin = originOf(out.route_key);
  const retDest = destOf(ret.route_key);
  const strike = Math.round(m * STRIKE_RATIO);
  const threshold = Math.round(m * THRESHOLD_RATIO);
  const displayOff = Math.round(((strike - total) / strike) * 100);
  const realOff = Math.round(((m - total) / m) * 100);
  const stops =
    typeof out.stops === "number" || typeof ret.stops === "number"
      ? Math.max(out.stops ?? 0, ret.stops ?? 0)
      : undefined;
  const airline = out.airline || ret.airline;
  const selfTransfer = Boolean(out.self_transfer || ret.self_transfer);
  return {
    id: `scrappa:${dest.code}:${outOrigin}:${out.outbound_date}:${retDest}:${ret.outbound_date}`,
    destination: `${dest.name} (${dest.code})`,
    price: Math.round(total),
    averagePrice: strike,
    thresholdPrice: threshold,
    discountPercent: displayOff,
    currency: "USD",
    outboundDate: out.outbound_date,
    returnDate: ret.outbound_date,
    airline,
    stops,
    selfTransfer: selfTransfer || undefined,
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
    postRatio,
  };
}

function monthMedian(
  outDaily: Map<string, { price: number; season: string }>,
  inDaily: Map<string, { price: number; season: string }>,
  season: string,
): number | null {
  const outMed = cityMonthlyMedian(outDaily, season);
  const inRaw = cityMonthlyMedian(inDaily, season);
  if (outMed == null || inRaw == null) return null;
  return outMed + Math.min(inRaw, outMed * 1.15);
}

function pairMonthM(
  outDaily: Map<string, { price: number; season: string }>,
  inDaily: Map<string, { price: number; season: string }>,
  out: Obs,
  ret: Obs,
): number | null {
  const outMed = cityMonthlyMedian(outDaily, out.season_key);
  const inRaw = cityMonthlyMedian(inDaily, ret.season_key);
  if (outMed == null || inRaw == null) return null;
  const outForReturnMonth =
    cityMonthlyMedian(outDaily, ret.season_key) ?? outMed;
  return outMed + Math.min(inRaw, outForReturnMonth * 1.15);
}
function collectPairs(
  dest: ScrappaDestination,
  rows: Obs[],
): { pairs: Pair[]; outDaily: ReturnType<typeof cityDailyMins>; inDaily: ReturnType<typeof cityDailyMins> } {
  const [minNights, maxNights] = stayRange(dest.code);
  const outbound = rows.filter((r) => destOf(r.route_key) === dest.code);
  const inbound = rows.filter((r) => originOf(r.route_key) === dest.code);
  const outDaily = cityDailyMins(rows, dest.code, "out");
  const inDaily = cityDailyMins(rows, dest.code, "in");
  const cheapestPair = new Map<string, Pair>();
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
  return { pairs: [...cheapestPair.values()], outDaily, inDaily };
}

function cheapestMonthFloor(
  dest: ScrappaDestination,
  pairs: Pair[],
  outDaily: ReturnType<typeof cityDailyMins>,
  inDaily: ReturnType<typeof cityDailyMins>,
  foundAt: string,
): Draft | null {
  const seasons = new Set<string>();
  for (const p of pairs) seasons.add(p.out.season_key);
  let cheapSeason: string | null = null;
  let cheapM = Infinity;
  for (const season of seasons) {
    const m = monthMedian(outDaily, inDaily, season);
    if (m == null || m >= cheapM) continue;
    cheapM = m;
    cheapSeason = season;
  }
  if (!cheapSeason) return null;
  const inMonth = pairs.filter(
    (p) =>
      p.out.season_key === cheapSeason && p.ret.season_key === cheapSeason,
  );
  const pool = inMonth.length > 0 ? inMonth : pairs.filter((p) => p.out.season_key === cheapSeason);
  let best: Pair | null = null;
  for (const p of pool) {
    if (!best || p.total < best.total) best = p;
  }
  if (!best) return null;
  const m = pairMonthM(outDaily, inDaily, best.out, best.ret);
  if (m == null || m <= 0) return null;
  return comboFromPair(
    dest,
    best,
    m,
    foundAt,
    postRatioForOutbound(best.out.outbound_date),
  );
}

export function matchDestDeals(
  dest: ScrappaDestination,
  rows: Obs[],
  foundAt = new Date().toISOString(),
): Deal[] {
  return matchDestDrafts(dest, rows, foundAt).dips.map(
    ({ realDiscount: _r, postRatio: _p, ...deal }) => deal,
  );
}

/** Dip + taban taslakları (paket doğrulaması yok). */
export function matchDestDraftDeals(
  dest: ScrappaDestination,
  rows: Obs[],
  foundAt = new Date().toISOString(),
): Deal[] {
  const { dips, floor } = matchDestDrafts(dest, rows, foundAt);
  const out = dips.map(({ realDiscount: _r, postRatio: _p, ...deal }) => deal);
  if (floor) {
    const key = `${floor.outboundDate}|${floor.returnDate}`;
    if (!out.some((d) => `${d.outboundDate}|${d.returnDate}` === key)) {
      const { realDiscount: _r, postRatio: _p, ...deal } = floor;
      out.push(deal);
    }
  }
  return out;
}

function matchDestDrafts(
  dest: ScrappaDestination,
  rows: Obs[],
  foundAt: string,
): { dips: Draft[]; floor: Draft | null } {
  const { pairs, outDaily, inDaily } = collectPairs(dest, rows);
  const combos: Draft[] = [];
  for (const pair of pairs) {
    const m = pairMonthM(outDaily, inDaily, pair.out, pair.ret);
    if (m == null || m <= 0) continue;
    const ratio = postRatioForOutbound(pair.out.outbound_date);
    if (pair.total > m * ratio) continue;
    combos.push(comboFromPair(dest, pair, m, foundAt, ratio));
  }
  const bestById = new Map<string, Draft>();
  for (const c of combos) {
    const prev = bestById.get(c.id);
    if (!prev || c.price < prev.price) bestById.set(c.id, c);
  }
  const dips = [...bestById.values()]
    .sort((a, b) => b.realDiscount - a.realDiscount || a.price - b.price)
    .slice(0, MAX_DIP_DEALS);
  const floor = cheapestMonthFloor(dest, pairs, outDaily, inDaily, foundAt);
  return { dips, floor };
}

function toDeal(draft: Draft): Deal {
  const { realDiscount: _r, postRatio: _p, ...deal } = draft;
  return deal;
}

async function verifyWithRoundTrip(
  deal: Deal,
  destCode: string,
  opts: { postRatio: number; skipGate?: boolean },
): Promise<Deal | null> {
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
    bookingToken?: string;
    airlineCode?: string;
    flightNumber?: string;
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
          bookingToken: hit.bookingToken,
          airlineCode: hit.airlineCode,
          flightNumber: hit.flightNumber,
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
  const booked = await scrappaCheapestBookingPrice({
    origin: best.origin,
    destination: destCode,
    departureDate: outDate,
    listPrice: best.price,
    bookingToken: best.bookingToken,
    airlineCode: best.airlineCode,
    flightNumber: best.flightNumber,
  });
  best.price = booked.price;
  if (opts.skipGate) {
    if (m != null && best.price > m) return null;
  } else if (m != null && best.price > m * opts.postRatio) {
    return null;
  }
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
  const { dips, floor } = matchDestDrafts(dest, rows, new Date().toISOString());
  const verified: Deal[] = [];
  const seen = new Set<string>();
  for (const draft of dips) {
    const next = await verifyWithRoundTrip(toDeal(draft), dest.code, {
      postRatio: draft.postRatio,
    });
    if (!next) continue;
    const key = `${next.outboundDate}|${next.returnDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(next);
  }
  if (floor) {
    const floorKey = `${floor.outboundDate}|${floor.returnDate}`;
    if (!seen.has(floorKey)) {
      const next = await verifyWithRoundTrip(toDeal(floor), dest.code, {
        postRatio: floor.postRatio,
        skipGate: true,
      });
      if (next) verified.push(next);
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
  let fresh: Deal[];
  try {
    fresh = await matchDestFromDb(admin, dest);
  } catch (err) {
    if (err instanceof ScrappaUnavailableError) {
      return { ok: false, count: 0, error: err.message };
    }
    throw err;
  }
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const others = previous.filter(
    (d) =>
      !isUnverifiedOneWaySum(d) &&
      (isGoogleDeal(d) || destCodeFromDeal(d) !== dest.code),
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
    let fresh: Deal[];
    try {
      fresh = await matchDestFromDb(admin, dest);
      console.log(`rematch ${dest.code} scrappa=${fresh.length}`);
    } catch (err) {
      if (!(err instanceof ScrappaUnavailableError)) throw err;
      // Oturum yokken boş liste yazma — mevcut Scrappa kartlarını koru.
      fresh = previous.filter(
        (d) => !isGoogleDeal(d) && destCodeFromDeal(d) === dest.code,
      );
      console.log(
        `rematch ${dest.code} keep=${fresh.length} (scrappa unavailable)`,
      );
    }
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
