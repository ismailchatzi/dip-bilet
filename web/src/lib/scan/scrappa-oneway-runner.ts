import { scrappaOneWay } from "@/lib/providers/scrappa";
import { insertObservations, type ObservationRow } from "@/lib/scan/observations";
import {
  allDestinations,
  horizonDates,
  legsForDest,
  type ScrappaWindow,
} from "@/lib/scan/scrappa-horizon";
import {
  publishAllShowcase,
  publishDestShowcase,
} from "@/lib/scan/scrappa-match";
import type { SupabaseClient } from "@supabase/supabase-js";

const DATES_PER_BATCH = 15;

export type ScrappaCursor = {
  window: ScrappaWindow;
  destIndex: number;
  dateIndex: number;
};

export type ScrappaBatchResult = {
  ok: boolean;
  done: boolean;
  next: ScrappaCursor | null;
  dest?: string;
  scanned: number;
  saved: number;
  matched: number;
  errors: string[];
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function seasonFromDate(iso: string) {
  return iso.slice(0, 7);
}

export async function runScrappaOneWayBatch(
  admin: SupabaseClient | null,
  cursor: ScrappaCursor,
): Promise<ScrappaBatchResult> {
  const dests = allDestinations();
  const dates = horizonDates(cursor.window);
  const errors: string[] = [];

  if (cursor.destIndex >= dests.length) {
    return {
      ok: true,
      done: true,
      next: null,
      scanned: 0,
      saved: 0,
      matched: 0,
      errors,
    };
  }

  const dest = dests[cursor.destIndex]!;
  const legs = legsForDest(dest.code, dest.name);
  const slice = dates.slice(
    cursor.dateIndex,
    cursor.dateIndex + DATES_PER_BATCH,
  );

  const rows: ObservationRow[] = [];
  let scanned = 0;

  for (const date of slice) {
    for (const leg of legs) {
      try {
        const fare = await scrappaOneWay({
          origin: leg.origin,
          destination: leg.destination,
          date,
        });
        scanned += 1;
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
          });
        }
      } catch (e) {
        errors.push(
          `${leg.origin}>${leg.destination} ${date}: ${e instanceof Error ? e.message : "hata"}`,
        );
      }
      await sleep(80);
    }
  }

  let saved = 0;
  if (admin && rows.length > 0) {
    const ins = await insertObservations(admin, rows);
    if (!ins.ok) errors.push(`observations: ${ins.error}`);
    else saved = rows.length;
  }

  const nextDate = cursor.dateIndex + DATES_PER_BATCH;
  let next: ScrappaCursor | null = null;
  if (nextDate < dates.length) {
    next = {
      window: cursor.window,
      destIndex: cursor.destIndex,
      dateIndex: nextDate,
    };
  } else if (cursor.destIndex + 1 < dests.length) {
    next = {
      window: cursor.window,
      destIndex: cursor.destIndex + 1,
      dateIndex: 0,
    };
  }

  let matched = 0;
  if (admin) {
    try {
      if (next === null) {
        const pub = await publishAllShowcase(admin);
        if (!pub.ok) errors.push(`vitrin: ${pub.error}`);
        else matched = pub.count;
      } else {
        const pub = await publishDestShowcase(admin, dest);
        if (!pub.ok) errors.push(`vitrin: ${pub.error}`);
        else matched = pub.count;
      }
    } catch (e) {
      errors.push(
        `vitrin: ${e instanceof Error ? e.message : "eşleştirme hatası"}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    done: next === null,
    next,
    dest: dest.code,
    scanned,
    saved,
    matched,
    errors: errors.slice(0, 20),
  };
}
