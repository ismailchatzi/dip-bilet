import {
  scrappaOneWay,
  ScrappaUnavailableError,
} from "@/lib/providers/scrappa";
import { insertObservations, type ObservationRow } from "@/lib/scan/observations";
import {
  allDestinations,
  horizonDates,
  legsForDest,
  type ScrappaWindow,
} from "@/lib/scan/scrappa-horizon";
import { SCRAPPA_SESSION_SOFT_PAUSE_MS } from "@/lib/scan/scrappa-schedule";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScrappaCursor = {
  window: ScrappaWindow;
  destIndex: number;
  dateIndex: number;
  legIndex: number;
};

export type ScrappaBatchResult = {
  ok: boolean;
  done: boolean;
  hold: boolean;
  next: ScrappaCursor | null;
  dest?: string;
  scanned: number;
  saved: number;
  matched: number;
  errors: string[];
  lastError?: string;
  pauseMs?: number;
};

function seasonFromDate(iso: string) {
  return iso.slice(0, 7);
}

function advance(
  cursor: ScrappaCursor,
  destCount: number,
  dateCount: number,
  legCount: number,
): ScrappaCursor | null {
  let { destIndex, dateIndex, legIndex, window } = cursor;
  legIndex += 1;
  if (legIndex < legCount) {
    return { window, destIndex, dateIndex, legIndex };
  }
  legIndex = 0;
  dateIndex += 1;
  if (dateIndex < dateCount) {
    return { window, destIndex, dateIndex, legIndex };
  }
  dateIndex = 0;
  destIndex += 1;
  if (destIndex < destCount) {
    return { window, destIndex, dateIndex, legIndex };
  }
  return null;
}

/** Tek bir tek-yön istek — Netlify kısa kesmesin diye. */
export async function runScrappaOneWayBatch(
  admin: SupabaseClient | null,
  cursor: ScrappaCursor,
): Promise<ScrappaBatchResult> {
  const dests = allDestinations();
  const dates = horizonDates(cursor.window);
  const errors: string[] = [];
  const destIndex = cursor.destIndex;
  const dateIndex = Math.max(0, cursor.dateIndex);
  const legIndex = Math.max(0, cursor.legIndex ?? 0);

  if (destIndex >= dests.length) {
    return {
      ok: true,
      done: true,
      hold: false,
      next: null,
      scanned: 0,
      saved: 0,
      matched: 0,
      errors,
    };
  }

  const dest = dests[destIndex]!;
  const legs = legsForDest(dest.code, dest.name);
  const date = dates[dateIndex];
  const leg = legs[legIndex];
  if (!date || !leg) {
    const next = advance(
      { ...cursor, destIndex, dateIndex, legIndex },
      dests.length,
      dates.length,
      legs.length,
    );
    return {
      ok: true,
      done: next === null,
      hold: false,
      next,
      dest: dest.code,
      scanned: 0,
      saved: 0,
      matched: 0,
      errors: ["boş dilim"],
    };
  }

  const rows: ObservationRow[] = [];
  let scanned = 0;
  try {
    const fare = await scrappaOneWay({
      origin: leg.origin,
      destination: leg.destination,
      date,
    });
    scanned = 1;
    if (fare) {
      rows.push({
        route_key: `${leg.origin}>${leg.destination}`,
        season_key: seasonFromDate(date),
        destination_code: dest.code,
        destination_name: `${leg.origin}→${leg.destination}`,
        price: fare.price,
        currency: "USD",
        outbound_date: date,
        return_date: null,
        source: "scrappa_oneway",
        discount_percent: null,
        average_price: null,
        airline: fare.airline ?? null,
        stops: typeof fare.stops === "number" ? fare.stops : null,
        self_transfer: fare.selfTransfer === true ? true : null,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hata";
    errors.push(`${leg.origin}>${leg.destination} ${date}: ${msg}`);
    if (e instanceof ScrappaUnavailableError) {
      // Uzun mola tick/applyBatch’te streak’e göre; burada sadece soft.
      return {
        ok: false,
        done: false,
        hold: true,
        next: { window: cursor.window, destIndex, dateIndex, legIndex },
        dest: dest.code,
        scanned: 0,
        saved: 0,
        matched: 0,
        errors: errors.slice(0, 20),
        lastError: msg,
        pauseMs: SCRAPPA_SESSION_SOFT_PAUSE_MS,
      };
    }
    scanned = 1;
  }

  let saved = 0;
  if (admin && rows.length > 0) {
    const ins = await insertObservations(admin, rows);
    if (!ins.ok) errors.push(`observations: ${ins.error}`);
    else saved = rows.length;
  }

  const next = advance(
    { window: cursor.window, destIndex, dateIndex, legIndex },
    dests.length,
    dates.length,
    legs.length,
  );

  // Rematch yalnız dilim bitince (tick autoRematch) — şehir şehir RT kredi yakmasın.
  return {
    ok: errors.length === 0,
    done: next === null,
    hold: false,
    next,
    dest: dest.code,
    scanned,
    saved,
    matched: 0,
    errors: errors.slice(0, 20),
  };
}
