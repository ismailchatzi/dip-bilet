import { notifyNewDeals } from "@/lib/notify-new-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import {
  SCRAPPA_DESTINATIONS,
  type ScrappaDestination,
} from "@/lib/scan/scrappa-targets";
import {
  googleFlightsSearchUrl,
  isUnverifiedOneWaySum,
  dealOutOrigin,
  foldOneCardPerCity,
  MAX_DATE_OPTIONS,
} from "@/lib/deal-display";
import {
  scrappaCheapestBookingPrice,
  scrappaRoundTrip,
  ScrappaUnavailableError,
} from "@/lib/providers/scrappa";
import {
  checkShowcaseEligibility,
  isVerifyCandidate,
  monthStatsFromTotals,
  type MonthSampleStats,
} from "@/lib/scan/showcase-eligibility";
import { hardFloorUsd, strikeFromThreshold } from "@/lib/scan/showcase-config";
import { nightsBetween, stayRange, maxStopsForDest } from "@/lib/scan/trip-rules";
import {
  SCRAPPA_PHASE_BREATHER_MS,
  SCRAPPA_REQUEST_GAP_MS,
} from "@/lib/scan/scrappa-schedule";
import type { Deal, DealDateOption } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Kahraman + diğer tarihler. */
const MAX_KEEP = 1 + MAX_DATE_OPTIONS;
/** Paket doğrulama denemesi tavanı (kredi). */
const MAX_VERIFY = 16;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Obs = {
  route_key: string;
  season_key: string;
  price: number;
  outbound_date: string;
  airline?: string;
  stops?: number;
  self_transfer?: boolean;
};

type BookingHook = {
  origin: "IST" | "SAW";
  destCode: string;
  departureDate: string;
  listPrice: number;
  bookingToken?: string;
  airlineCode?: string;
  flightNumber?: string;
  monthStats: MonthSampleStats;
};

type RtPending = {
  deal: Deal;
  booking?: BookingHook;
};

function originOf(routeKey: string) {
  return routeKey.split(">")[0] ?? "";
}

function destOf(routeKey: string) {
  return routeKey.split(">")[1] ?? "";
}

function isIstanbul(code: string) {
  return code === "IST" || code === "SAW";
}

function departureLabel(outOrigin: string, retDest: string) {
  if (outOrigin === retDest) return `İstanbul (${outOrigin})`;
  return `İstanbul (${outOrigin} → ${retDest})`;
}

/** Supabase/PostgREST varsayılan max ~1000 satır; .limit(8000) yetmez → sayfala. */
const OBS_PAGE = 1000;
const OBS_PAGE_CAP = 50;

async function loadObservations(
  admin: SupabaseClient,
  destCode: string,
): Promise<Obs[]> {
  const colsFull =
    "route_key, season_key, price, outbound_date, airline, stops, self_transfer";
  const colsSlim = "route_key, season_key, price, outbound_date";
  let cols = colsFull;
  const raw: Obs[] = [];

  for (let page = 0; page < OBS_PAGE_CAP; page++) {
    const from = page * OBS_PAGE;
    const to = from + OBS_PAGE - 1;
    let res = await admin
      .from("price_observations")
      .select(cols)
      .eq("destination_code", destCode)
      .eq("source", "scrappa_oneway")
      .not("outbound_date", "is", null)
      .order("outbound_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (
      res.error &&
      cols === colsFull &&
      /airline|stops|self_transfer|schema cache/i.test(res.error.message)
    ) {
      cols = colsSlim;
      page -= 1;
      continue;
    }
    if (res.error || !res.data) break;

    for (const r of res.data) {
      const row = r as unknown as {
        route_key: unknown;
        season_key: unknown;
        price: unknown;
        outbound_date: unknown;
        airline?: unknown;
        stops?: unknown;
        self_transfer?: unknown;
      };
      const obs: Obs = {
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
      if (
        obs.route_key.includes(">") &&
        Number.isFinite(obs.price) &&
        obs.price > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(obs.outbound_date)
      ) {
        raw.push(obs);
      }
    }
    if (res.data.length < OBS_PAGE) break;
  }

  // Aynı rota+gün tekrarları (çift drain) → en ucuz kalsın
  const best = new Map<string, Obs>();
  for (const o of raw) {
    const key = `${o.route_key}|${o.outbound_date}`;
    const prev = best.get(key);
    if (!prev || o.price < prev.price) best.set(key, o);
  }
  return [...best.values()];
}

type Pair = {
  total: number;
  out: Obs;
  ret: Obs;
};

type Draft = Deal & { seasonKey: string };

function collectPairs(dest: ScrappaDestination, rows: Obs[]): Pair[] {
  const [minNights, maxNights] = stayRange(dest.code);
  const outbound = rows.filter((r) => destOf(r.route_key) === dest.code);
  const inbound = rows.filter((r) => originOf(r.route_key) === dest.code);
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
  return [...cheapestPair.values()];
}

/** O ay: sentetik RT aday toplamları → medyan + örneklem. */
function monthStatsForSeason(pairs: Pair[], seasonKey: string): MonthSampleStats {
  const inSeason = pairs.filter((p) => p.out.season_key === seasonKey);
  return monthStatsFromTotals(
    inSeason.map((p) => p.total),
    inSeason.map((p) => p.out.outbound_date),
  );
}

function comboFromPair(
  dest: ScrappaDestination,
  pair: Pair,
  foundAt: string,
  el: Extract<
    ReturnType<typeof checkShowcaseEligibility>,
    { isEligible: true }
  >,
): Draft {
  const { total, out, ret } = pair;
  const outOrigin = originOf(out.route_key);
  const retDest = destOf(ret.route_key);
  const displayOff = Math.round(
    ((el.strikePrice - total) / el.strikePrice) * 100,
  );
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
    averagePrice: el.strikePrice,
    thresholdPrice: el.uiThreshold,
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
    dealBadge: el.badge,
    seasonKey: out.season_key,
  };
}

export function matchDestDeals(
  dest: ScrappaDestination,
  rows: Obs[],
  foundAt = new Date().toISOString(),
): Deal[] {
  return matchDestDrafts(dest, rows, foundAt).map(
    ({ seasonKey: _s, ...deal }) => deal,
  );
}

function matchDestDrafts(
  dest: ScrappaDestination,
  rows: Obs[],
  foundAt: string,
): Draft[] {
  const pairs = collectPairs(dest, rows);
  const statsBySeason = new Map<string, MonthSampleStats>();
  const combos: Draft[] = [];

  for (const pair of pairs) {
    const season = pair.out.season_key;
    let stats = statsBySeason.get(season);
    if (!stats) {
      stats = monthStatsForSeason(pairs, season);
      statsBySeason.set(season, stats);
    }
    if (
      !isVerifyCandidate({
        destCode: dest.code,
        syntheticTotal: pair.total,
        monthStats: stats,
      })
    ) {
      continue;
    }

    const el = checkShowcaseEligibility({
      destCode: dest.code,
      packagePrice: pair.total,
      monthStats: stats,
    });
    const floor = hardFloorUsd(dest.code);
    const placeholder = el.isEligible
      ? el
      : {
          isEligible: true as const,
          badge: "MUTLAK_FIRSAT" as const,
          uiThreshold: floor ?? Math.round(pair.total),
          strikePrice: strikeFromThreshold(
            floor ?? Math.round(pair.total),
            stats.median,
          ),
          monthlyMedian: stats.median,
          benchmarkMode: "synthetic_rt_candidate" as const,
        };

    combos.push(comboFromPair(dest, pair, foundAt, placeholder));
  }

  const bestById = new Map<string, Draft>();
  for (const c of combos) {
    const prev = bestById.get(c.id);
    if (!prev || c.price < prev.price) bestById.set(c.id, c);
  }
  return [...bestById.values()].sort((a, b) => a.price - b.price);
}

function toDeal(draft: Draft): Deal {
  const { seasonKey: _s, ...deal } = draft;
  return deal;
}

function toDateOption(deal: Deal): DealDateOption {
  return {
    outboundDate: deal.outboundDate ?? "",
    returnDate: deal.returnDate ?? "",
    price: deal.price,
    airline: deal.airline,
    origin: dealOutOrigin(deal),
    foundAt: deal.foundAt,
    source: "scrappa",
  };
}

async function verifyWithRoundTrip(
  deal: Deal,
  destCode: string,
  monthStats: MonthSampleStats,
  opts?: { withBooking?: boolean },
): Promise<RtPending | null> {
  const outDate = deal.outboundDate;
  const retDate = deal.returnDate;
  if (!outDate || !retDate) return null;

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
      await sleep(SCRAPPA_REQUEST_GAP_MS);
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

  const booking: BookingHook = {
    origin: best.origin,
    destCode,
    departureDate: outDate,
    listPrice: best.price,
    bookingToken: best.bookingToken,
    airlineCode: best.airlineCode,
    flightNumber: best.flightNumber,
    monthStats,
  };

  if (opts?.withBooking !== false) {
    const booked = await scrappaCheapestBookingPrice({
      origin: booking.origin,
      destination: booking.destCode,
      departureDate: booking.departureDate,
      listPrice: booking.listPrice,
      bookingToken: booking.bookingToken,
      airlineCode: booking.airlineCode,
      flightNumber: booking.flightNumber,
    });
    await sleep(SCRAPPA_REQUEST_GAP_MS);
    best.price = booked.price;
  }

  const el = checkShowcaseEligibility({
    destCode,
    packagePrice: best.price,
    monthStats,
  });
  if (!el.isEligible) return null;

  const now = new Date().toISOString();
  const displayOff = Math.round(
    ((el.strikePrice - best.price) / el.strikePrice) * 100,
  );
  const nextDeal: Deal = {
    ...deal,
    id: `scrappa:${destCode}:${best.origin}:${outDate}:${best.origin}:${retDate}`,
    price: Math.round(best.price),
    averagePrice: el.strikePrice,
    thresholdPrice: el.uiThreshold,
    discountPercent: displayOff,
    dealBadge: el.badge,
    airline: best.airline,
    stops: best.stops,
    selfTransfer: best.selfTransfer,
    verifiedAt: now,
    lastCheckedAt: now,
    googleFlightsUrl: googleFlightsSearchUrl(
      best.origin,
      destCode,
      outDate,
      best.origin,
      retDate,
    ),
    departureLabel: departureLabel(best.origin, best.origin),
  };
  return {
    deal: nextDeal,
    booking: opts?.withBooking === false ? booking : undefined,
  };
}

async function applyBookingToDeal(pending: RtPending): Promise<Deal | null> {
  const hook = pending.booking;
  if (!hook) return pending.deal;
  const booked = await scrappaCheapestBookingPrice({
    origin: hook.origin,
    destination: hook.destCode,
    departureDate: hook.departureDate,
    listPrice: hook.listPrice,
    bookingToken: hook.bookingToken,
    airlineCode: hook.airlineCode,
    flightNumber: hook.flightNumber,
  });
  await sleep(SCRAPPA_REQUEST_GAP_MS);
  const el = checkShowcaseEligibility({
    destCode: hook.destCode,
    packagePrice: booked.price,
    monthStats: hook.monthStats,
  });
  if (!el.isEligible) return null;
  const displayOff = Math.round(
    ((el.strikePrice - booked.price) / el.strikePrice) * 100,
  );
  const now = new Date().toISOString();
  return {
    ...pending.deal,
    price: Math.round(booked.price),
    averagePrice: el.strikePrice,
    thresholdPrice: el.uiThreshold,
    discountPercent: displayOff,
    dealBadge: el.badge,
    verifiedAt: now,
    lastCheckedAt: now,
  };
}

export async function matchDestFromDb(
  admin: SupabaseClient,
  dest: ScrappaDestination,
  opts?: { withBooking?: boolean },
): Promise<{ card: Deal | null; pending: RtPending[] }> {
  const rows = await loadObservations(admin, dest.code);
  const pairs = collectPairs(dest, rows);
  const drafts = matchDestDrafts(dest, rows, new Date().toISOString());
  const verified: RtPending[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  for (const draft of drafts) {
    if (verified.length >= MAX_KEEP) break;
    if (attempts >= MAX_VERIFY) break;
    attempts += 1;
    const stats = monthStatsForSeason(pairs, draft.seasonKey);
    const next = await verifyWithRoundTrip(toDeal(draft), dest.code, stats, {
      withBooking: opts?.withBooking,
    });
    if (!next) continue;
    const key = `${next.deal.outboundDate}|${next.deal.returnDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(next);
  }
  if (verified.length === 0) return { card: null, pending: [] };
  verified.sort(
    (a, b) =>
      a.deal.price - b.deal.price ||
      (b.deal.foundAt ?? "").localeCompare(a.deal.foundAt ?? ""),
  );
  const card: Deal = {
    ...verified[0]!.deal,
    dateOptions: verified
      .slice(1, 1 + MAX_DATE_OPTIONS)
      .sort(
        (a, b) =>
          (b.deal.foundAt ?? "").localeCompare(a.deal.foundAt ?? "") ||
          a.deal.price - b.deal.price,
      )
      .map((p) => toDateOption(p.deal)),
  };
  return { card, pending: verified };
}

function cardFromPending(pending: RtPending[]): Deal | null {
  if (pending.length === 0) return null;
  const sorted = [...pending].sort(
    (a, b) =>
      a.deal.price - b.deal.price ||
      (b.deal.foundAt ?? "").localeCompare(a.deal.foundAt ?? ""),
  );
  return {
    ...sorted[0]!.deal,
    dateOptions: sorted
      .slice(1, 1 + MAX_DATE_OPTIONS)
      .sort(
        (a, b) =>
          (b.deal.foundAt ?? "").localeCompare(a.deal.foundAt ?? "") ||
          a.deal.price - b.deal.price,
      )
      .map((p) => toDateOption(p.deal)),
  };
}

function destCodeFromDeal(deal: Deal) {
  if (
    deal.id.startsWith("scrappa:") ||
    deal.id.startsWith("gdeals:") ||
    deal.id.startsWith("manual:")
  ) {
    return deal.id.split(":")[1] ?? "";
  }
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

function isGoogleDeal(deal: Deal) {
  return deal.id.startsWith("gdeals:");
}

function isManualDeal(deal: Deal) {
  return deal.id.startsWith("manual:");
}

/** Bir varışın vitrin kartlarını günceller, diğer şehirleri korur */
export async function publishDestShowcase(
  admin: SupabaseClient,
  dest: ScrappaDestination,
): Promise<{ ok: boolean; count: number; error?: string }> {
  let card: Deal | null;
  try {
    const matched = await matchDestFromDb(admin, dest, { withBooking: true });
    card = matched.card;
  } catch (err) {
    if (err instanceof ScrappaUnavailableError) {
      return { ok: false, count: 0, error: err.message };
    }
    throw err;
  }
  const fresh = card ? [card] : [];
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const others = previous.filter((d) => destCodeFromDeal(d) !== dest.code);
  const cityPrev = previous.filter((d) => destCodeFromDeal(d) === dest.code);
  const deals = [
    ...others.filter((d) => !isUnverifiedOneWaySum(d)),
    ...foldOneCardPerCity([...cityPrev, ...fresh]),
  ];
  const { payload, live, previousLive } = foldShowcase(board.deals, deals);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, count: 0, error: saved.error };
  await notifyNewDeals(admin, previousLive, live);
  return { ok: true, count: fresh.length };
}

function foldAutoAndManual(
  boardDeals: Deal[] | undefined,
  scrappaCards: Deal[],
  googleKept: Deal[],
  manualKept: Deal[],
) {
  const auto = [...googleKept, ...scrappaCards];
  const collapsedAuto = foldOneCardPerCity(
    auto.filter((d) => !isUnverifiedOneWaySum(d)),
  );
  const autoCities = new Set(
    collapsedAuto.map((d) => destCodeFromDeal(d)).filter(Boolean),
  );
  const manualOnly = manualKept.filter(
    (d) => !autoCities.has(destCodeFromDeal(d)),
  );
  return foldOneCardPerCity([
    ...collapsedAuto,
    ...manualOnly.filter((d) => !isUnverifiedOneWaySum(d)),
  ]);
}

/**
 * One-way dilim sonrası:
 * nefes → round-trip → nefes → booking-details → vitrin.
 */
export async function publishAllShowcase(
  admin: SupabaseClient,
  opts?: { notify?: boolean; skipBreather?: boolean },
): Promise<{ ok: boolean; count: number; error?: string; aborted?: boolean }> {
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const googleKept = previous.filter(isGoogleDeal);
  const manualKept = previous.filter(isManualDeal);

  if (!opts?.skipBreather) {
    console.log(
      `rematch: one-way sonrası ${SCRAPPA_PHASE_BREATHER_MS / 1000}s nefes`,
    );
    await sleep(SCRAPPA_PHASE_BREATHER_MS);
  }

  console.log("rematch: round-trip fazı");
  const pendingByDest = new Map<string, RtPending[]>();
  const scrappaCards: Deal[] = [];
  let aborted = false;

  for (let i = 0; i < SCRAPPA_DESTINATIONS.length; i++) {
    const dest = SCRAPPA_DESTINATIONS[i]!;
    try {
      const matched = await matchDestFromDb(admin, dest, {
        withBooking: false,
      });
      console.log(
        `rematch RT ${dest.code} scrappa=${matched.card ? 1 : 0}`,
      );
      if (matched.card) scrappaCards.push(matched.card);
      if (matched.pending.length > 0) {
        pendingByDest.set(dest.code, matched.pending);
      }
    } catch (err) {
      if (!(err instanceof ScrappaUnavailableError)) throw err;
      aborted = true;
      console.log(
        `rematch RT abort @${dest.code}: ${err instanceof Error ? err.message : "unavailable"}`,
      );
      for (let j = i; j < SCRAPPA_DESTINATIONS.length; j++) {
        const code = SCRAPPA_DESTINATIONS[j]!.code;
        for (const deal of previous) {
          if (
            !isGoogleDeal(deal) &&
            !isManualDeal(deal) &&
            destCodeFromDeal(deal) === code
          ) {
            scrappaCards.push(deal);
          }
        }
      }
      break;
    }
  }

  {
    const collapsed = foldAutoAndManual(
      board.deals?.deals,
      scrappaCards,
      googleKept,
      manualKept,
    );
    const { payload } = foldShowcase(board.deals, collapsed);
    const saved = await patchScanBoard(admin, { deals: payload });
    if (!saved.ok) return { ok: false, count: 0, error: saved.error };
  }

  if (aborted) {
    console.log("rematch: RT abort — booking fazı atlandı");
    const liveBoard = await readScanBoard(admin);
    return {
      ok: true,
      count: liveBoard.deals?.deals?.length ?? 0,
      aborted: true,
    };
  }

  if (!opts?.skipBreather) {
    console.log(
      `rematch: booking öncesi ${SCRAPPA_PHASE_BREATHER_MS / 1000}s nefes`,
    );
    await sleep(SCRAPPA_PHASE_BREATHER_MS);
  }

  console.log("rematch: booking-details fazı");
  const bookedCards: Deal[] = [];
  bookingLoop: for (const dest of SCRAPPA_DESTINATIONS) {
    const pending = pendingByDest.get(dest.code);
    if (!pending?.length) continue;
    const updated: RtPending[] = [];
    for (const item of pending) {
      try {
        const deal = await applyBookingToDeal(item);
        if (deal) updated.push({ deal, booking: undefined });
      } catch (err) {
        if (!(err instanceof ScrappaUnavailableError)) throw err;
        aborted = true;
        console.log(
          `rematch booking abort @${dest.code}: ${err instanceof Error ? err.message : "unavailable"}`,
        );
        // Bu şehir + kalanlar: RT fiyatı veya önceki kart
        const rtCard = cardFromPending(pending);
        if (rtCard) bookedCards.push(rtCard);
        for (const rest of SCRAPPA_DESTINATIONS) {
          if (rest.code === dest.code) continue;
          if (!pendingByDest.has(rest.code)) continue;
          if (bookedCards.some((d) => destCodeFromDeal(d) === rest.code)) {
            continue;
          }
          const p = pendingByDest.get(rest.code)!;
          const c = cardFromPending(p);
          if (c) bookedCards.push(c);
        }
        break bookingLoop;
      }
    }
    const card = cardFromPending(updated);
    if (card) bookedCards.push(card);
    console.log(`rematch booking ${dest.code} ok=${card ? 1 : 0}`);
  }

  const collapsed = foldAutoAndManual(
    board.deals?.deals,
    bookedCards,
    googleKept,
    manualKept,
  );
  const { payload, live, previousLive } = foldShowcase(board.deals, collapsed);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, count: 0, error: saved.error };
  if (opts?.notify !== false) {
    await notifyNewDeals(admin, previousLive, live);
  }
  return { ok: true, count: live.length, aborted };
}
