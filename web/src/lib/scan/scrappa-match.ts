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
  SCRAPPA_REMATCH_502_BACKOFF_MS,
  SCRAPPA_REMATCH_CANDIDATE_GAP_MS,
  SCRAPPA_REMATCH_CANDIDATE_MAX_ATTEMPTS,
  SCRAPPA_REMATCH_RESERVE_CANDIDATES,
  SCRAPPA_REMATCH_TOP_CANDIDATES,
  SCRAPPA_REQUEST_GAP_MS,
} from "@/lib/scan/scrappa-schedule";
import type { Deal, DealDateOption } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Kahraman + diğer tarihler. */
const MAX_KEEP = 1 + MAX_DATE_OPTIONS;
/** Legacy / manuel publish tavanı. Rematch top-N kullanır. */
const MAX_VERIFY = 16;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rematchBackoffMs(failedAttempt: number) {
  const base =
    SCRAPPA_REMATCH_502_BACKOFF_MS[
      Math.min(
        Math.max(failedAttempt - 1, 0),
        SCRAPPA_REMATCH_502_BACKOFF_MS.length - 1,
      )
    ] ?? 30_000;
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(5_000, Math.round(base + jitter));
}

export type DeferredRtCandidate = {
  destCode: string;
  outboundDate: string;
  returnDate: string;
  deferUntil: string;
  /** 0 = henüz defer retry yok; 1 = retry de fail → o gün bırak */
  deferRetries: number;
};

type Obs = {
  route_key: string;
  season_key: string;
  price: number;
  outbound_date: string;
  airline?: string;
  stops?: number;
  self_transfer?: boolean;
};

export type BookingHook = {
  origin: "IST" | "SAW";
  destCode: string;
  departureDate: string;
  listPrice: number;
  bookingToken?: string;
  airlineCode?: string;
  flightNumber?: string;
  monthStats: MonthSampleStats;
};

export type RtPending = {
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

export type MatchObsFilter = {
  observedAtGte?: string;
  observedAtLt?: string;
  outboundDateGte?: string;
  outboundDateLte?: string;
};

async function loadObservations(
  admin: SupabaseClient,
  destCode: string,
  filter?: MatchObsFilter,
): Promise<Obs[]> {
  const colsFull =
    "route_key, season_key, price, outbound_date, airline, stops, self_transfer";
  const colsSlim = "route_key, season_key, price, outbound_date";
  let cols = colsFull;
  const raw: Obs[] = [];

  for (let page = 0; page < OBS_PAGE_CAP; page++) {
    const from = page * OBS_PAGE;
    const to = from + OBS_PAGE - 1;
    let q = admin
      .from("price_observations")
      .select(cols)
      .eq("destination_code", destCode)
      .eq("source", "scrappa_oneway")
      .not("outbound_date", "is", null);
    if (filter?.observedAtGte) {
      q = q.gte("observed_at", filter.observedAtGte);
    }
    if (filter?.observedAtLt) {
      q = q.lt("observed_at", filter.observedAtLt);
    }
    if (filter?.outboundDateGte) {
      q = q.gte("outbound_date", filter.outboundDateGte);
    }
    if (filter?.outboundDateLte) {
      q = q.lte("outbound_date", filter.outboundDateLte);
    }
    let res = await q
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
  opts?: {
    withBooking?: boolean;
    /** Scrappa 200 / başarılı cevap — oturum var, streak sıfırlansın. */
    onSessionOk?: () => void | Promise<void>;
  },
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

  const preferred =
    dealOutOrigin(deal) === "IST" ? ("IST" as const) : ("SAW" as const);
  const origins =
    preferred === "SAW"
      ? (["SAW", "IST"] as const)
      : (["IST", "SAW"] as const);

  for (const origin of origins) {
    try {
      const hit = await scrappaRoundTrip({
        origin,
        destination: destCode,
        departureDate: outDate,
        returnDate: retDate,
      });
      await opts?.onSessionOk?.();
      await sleep(SCRAPPA_REQUEST_GAP_MS);
      if (!hit) continue;
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
      // Sentetik gidiş origin’i tuttu; ikinci origin’e gitme (RT trafiğini yarıla).
      break;
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
    await opts?.onSessionOk?.();
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

export async function applyBookingToDeal(
  pending: RtPending,
  opts?: { onSessionOk?: () => void | Promise<void> },
): Promise<Deal | null> {
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
  await opts?.onSessionOk?.();
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
  opts?: {
    withBooking?: boolean;
    obs?: MatchObsFilter;
    /**
     * Rematch modu: top 3+2, aday başı max 3 RT, 502 aday içi backoff,
     * hero bulununca şehir STOP, adaylar arası 15 sn. Transient job kilitlemez.
     */
    rematchMode?: boolean;
    /** Bu kadar aday zaten bitti (başarı/skip/defer) — kaldığı yerden. */
    startAttempt?: number;
    seedPending?: RtPending[];
    onAttemptDone?: (info: {
      attempts: number;
      pending: RtPending[];
      deferred?: DeferredRtCandidate;
    }) => void | Promise<void>;
    onSessionOk?: () => void | Promise<void>;
  },
): Promise<{
  card: Deal | null;
  pending: RtPending[];
  deferred: DeferredRtCandidate[];
}> {
  const rows = await loadObservations(admin, dest.code, opts?.obs);
  const pairs = collectPairs(dest, rows);
  let drafts = matchDestDrafts(dest, rows, new Date().toISOString());
  drafts = [...drafts].sort(
    (a, b) =>
      (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
      a.price - b.price,
  );

  const rematchMode = opts?.rematchMode === true;
  const maxCandidates = rematchMode
    ? SCRAPPA_REMATCH_TOP_CANDIDATES + SCRAPPA_REMATCH_RESERVE_CANDIDATES
    : MAX_VERIFY;
  drafts = drafts.slice(0, maxCandidates);

  const verified: RtPending[] = [...(opts?.seedPending ?? [])];
  const deferred: DeferredRtCandidate[] = [];
  const seen = new Set(
    verified.map(
      (p) => `${p.deal.outboundDate ?? ""}|${p.deal.returnDate ?? ""}`,
    ),
  );
  const startAttempt = Math.max(0, opts?.startAttempt ?? 0);
  const maxAttempts = rematchMode
    ? SCRAPPA_REMATCH_CANDIDATE_MAX_ATTEMPTS
    : 1;
  const stopOnHero = rematchMode;

  let candidateIndex = 0;
  for (const draft of drafts) {
    if (stopOnHero && verified.length >= 1) break;
    if (!rematchMode && verified.length >= MAX_KEEP) break;
    if (candidateIndex < startAttempt) {
      candidateIndex += 1;
      continue;
    }

    const stats = monthStatsForSeason(pairs, draft.seasonKey);
    let got: RtPending | null = null;
    let deferredThis = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        got = await verifyWithRoundTrip(toDeal(draft), dest.code, stats, {
          withBooking: rematchMode ? false : opts?.withBooking,
          onSessionOk: opts?.onSessionOk,
        });
        if (got) {
          const key = `${got.deal.outboundDate}|${got.deal.returnDate}`;
          if (!seen.has(key)) {
            seen.add(key);
            verified.push(got);
          }
        }
        break;
      } catch (err) {
        if (!(err instanceof ScrappaUnavailableError)) throw err;
        if (err.kind === "session" || !rematchMode) {
          await opts?.onAttemptDone?.({
            attempts: candidateIndex,
            pending: verified,
          });
          throw err;
        }
        console.log(
          JSON.stringify({
            tag: "rematch-candidate-502",
            dest: dest.code,
            dates: `${draft.outboundDate}/${draft.returnDate}`,
            attempt,
            stage: err.stage,
            durationMs: err.durationMs,
            maxAttempts,
          }),
        );
        if (attempt >= maxAttempts) {
          const out = draft.outboundDate ?? "";
          const ret = draft.returnDate ?? "";
          if (!out || !ret) break;
          const item: DeferredRtCandidate = {
            destCode: dest.code,
            outboundDate: out,
            returnDate: ret,
            deferUntil: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
            deferRetries: 0,
          };
          deferred.push(item);
          deferredThis = true;
          console.log(
            `rematch defer ${dest.code} ${draft.outboundDate}→${draft.returnDate} after ${attempt}×502`,
          );
          break;
        }
        const wait = rematchBackoffMs(attempt);
        console.log(
          `rematch backoff ${dest.code} attempt ${attempt} → ${wait}ms`,
        );
        await opts?.onAttemptDone?.({
          attempts: candidateIndex,
          pending: verified,
        });
        await sleep(wait);
      }
    }

    candidateIndex += 1;
    await opts?.onAttemptDone?.({
      attempts: candidateIndex,
      pending: verified,
      deferred: deferredThis ? deferred[deferred.length - 1] : undefined,
    });

    if (
      rematchMode &&
      candidateIndex < drafts.length &&
      !(stopOnHero && verified.length >= 1)
    ) {
      await sleep(SCRAPPA_REMATCH_CANDIDATE_GAP_MS);
    }
  }

  if (verified.length === 0) return { card: null, pending: [], deferred };
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
  return { card, pending: verified, deferred };
}


export function cardFromPending(pending: RtPending[]): Deal | null {
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

export function destCodeFromDeal(deal: Deal) {
  if (
    deal.id.startsWith("scrappa:") ||
    deal.id.startsWith("gdeals:") ||
    deal.id.startsWith("manual:")
  ) {
    return deal.id.split(":")[1] ?? "";
  }
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

export function isGoogleDeal(deal: Deal) {
  return deal.id.startsWith("gdeals:");
}

export function isManualDeal(deal: Deal) {
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

export function foldAutoAndManual(
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
 * One-way dilim sonrası / elle rematch.
 * Artık abort = bitiş değil; job + drain kaldığı yerden devam eder.
 * Sync çağrılar bitene (veya idle) kadar tick eder.
 */
export async function publishAllShowcase(
  admin: SupabaseClient,
  opts?: { notify?: boolean; skipBreather?: boolean },
): Promise<{ ok: boolean; count: number; error?: string; aborted?: boolean }> {
  const { runRematchToCompletion } = await import("@/lib/scan/scrappa-rematch");
  return runRematchToCompletion(admin, {
    force: true,
    notify: opts?.notify,
    skipBreather: opts?.skipBreather,
  });
}
