import { notifyNewDeals } from "@/lib/notify-new-deals";
import { fetchGoogleDeals } from "@/lib/providers/serpapi-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { archiveTripKey, foldShowcase, isLiveDeal } from "@/lib/scan/deal-archive";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import { turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const STRIKE_RATIO = 1.1;
const THRESHOLD_RATIO = 0.9;

export type SerpapiDealsScanResult = {
  ok: boolean;
  fetched: number;
  matched: number;
  added: number;
  skippedDup: number;
  error?: string;
};

function destFromHit(hit: {
  arrival_airport_code?: string;
  name?: string;
}): { code: string; name: string } | null {
  const arrival = String(hit.arrival_airport_code ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(arrival)) return null;
  if (arrival === "IST" || arrival === "SAW") return null;
  const tracked = findTrackedDestination(arrival);
  if (tracked) return { code: tracked.code, name: tracked.name };
  const raw = String(hit.name ?? "")
    .replace(/\s*\([A-Z]{3}\)\s*$/, "")
    .trim();
  return { code: arrival, name: raw || arrival };
}

function departureLabel(origin: string) {
  if (origin === "SAW" || origin === "IST") return `İstanbul (${origin})`;
  return `İstanbul (${origin})`;
}

function toShowcaseDeal(
  hit: {
    price: number;
    average?: number;
    discount?: number;
    link?: string;
    outDate: string;
    retDate: string;
    origin: string;
    stops?: number;
    airline?: string;
  },
  dest: { code: string; name: string },
  foundAt: string,
): Deal {
  const strike = hit.average
    ? Math.round(hit.average * STRIKE_RATIO)
    : undefined;
  const threshold = hit.average
    ? Math.round(hit.average * THRESHOLD_RATIO)
    : undefined;
  const displayOff = strike
    ? Math.round(((strike - hit.price) / strike) * 100)
    : hit.discount;

  return {
    id: `gdeals:${dest.code}:${hit.origin}:${hit.outDate}:${hit.origin}:${hit.retDate}`,
    destination: `${dest.name} (${dest.code})`,
    price: Math.round(hit.price),
    averagePrice: strike,
    thresholdPrice: threshold,
    discountPercent:
      typeof displayOff === "number" && Number.isFinite(displayOff)
        ? displayOff
        : undefined,
    currency: "USD",
    outboundDate: hit.outDate,
    returnDate: hit.retDate,
    airline: hit.airline,
    stops: hit.stops,
    googleFlightsUrl: hit.link,
    departureLabel: departureLabel(hit.origin),
    foundAt,
  };
}

export async function runSerpapiDealsScan(
  admin: SupabaseClient | null,
): Promise<SerpapiDealsScanResult> {
  const today = turkeyTodayIso();
  const fetched = await fetchGoogleDeals();
  if (!fetched.ok) {
    return {
      ok: false,
      fetched: 0,
      matched: 0,
      added: 0,
      skippedDup: 0,
      error: fetched.error,
    };
  }

  const foundAt = new Date().toISOString();
  const matched: Deal[] = [];

  for (const hit of fetched.deals) {
    const dest = destFromHit(hit);
    if (!dest) continue;

    const outDate = hit.start_date ?? "";
    const retDate = hit.end_date ?? "";
    const price = Number(hit.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(outDate)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(retDate)) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    if (outDate < today) continue;

    const origin = String(hit.departure_airport_code ?? "IST").toUpperCase();
    matched.push(
      toShowcaseDeal(
        {
          price,
          average: Number(hit.average_price) || undefined,
          discount: Number(hit.discount_percentage) || undefined,
          link: hit.flight_link,
          outDate,
          retDate,
          origin: origin === "SAW" ? "SAW" : "IST",
          stops: typeof hit.stops === "number" ? hit.stops : undefined,
          airline: hit.airline,
        },
        dest,
        foundAt,
      ),
    );
  }

  if (!admin) {
    return {
      ok: true,
      fetched: fetched.deals.length,
      matched: matched.length,
      added: 0,
      skippedDup: 0,
      error: "Supabase yok",
    };
  }

  const board = await readScanBoard(admin);
  const existingLive = (board.deals?.deals ?? []).filter((d) =>
    isLiveDeal(d, today),
  );
  const seen = new Set(existingLive.map(archiveTripKey));
  const fresh: Deal[] = [];
  let skippedDup = 0;

  for (const deal of matched) {
    const key = archiveTripKey(deal);
    if (seen.has(key)) {
      skippedDup += 1;
      continue;
    }
    seen.add(key);
    fresh.push(deal);
  }

  const { payload, live, previousLive } = foldShowcase(
    board.deals,
    [...existingLive, ...fresh],
    foundAt,
    today,
  );
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) {
    return {
      ok: false,
      fetched: fetched.deals.length,
      matched: matched.length,
      added: 0,
      skippedDup,
      error: saved.error,
    };
  }

  await notifyNewDeals(admin, previousLive, live);

  return {
    ok: true,
    fetched: fetched.deals.length,
    matched: matched.length,
    added: fresh.length,
    skippedDup,
  };
}
