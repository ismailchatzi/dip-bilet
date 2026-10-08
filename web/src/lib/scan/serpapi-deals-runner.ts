import { notifyNewDeals } from "@/lib/notify-new-deals";
import { foldOneCardPerCity } from "@/lib/deal-display";
import { fetchGoogleDeals } from "@/lib/providers/serpapi-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { archiveTripKey, foldShowcase, isLiveDeal } from "@/lib/scan/deal-archive";
import { passesGoogleDealGates } from "@/lib/scan/google-deals-gates";
import { checkAgainstOwnOneWays } from "@/lib/scan/google-deals-sanity";
import { routeKey, seasonKey } from "@/lib/scan/dates";
import { insertObservations, type ObservationRow } from "@/lib/scan/observations";
import { destPhotoCode } from "@/lib/destination-photos";
import {
  findTrackedDestination,
  trackedDestinationLabel,
} from "@/lib/scan/scrappa-targets";
import { maxStopsForDest, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SerpapiDealsScanResult = {
  ok: boolean;
  fetched: number;
  matched: number;
  added: number;
  skippedDup: number;
  skippedGate: number;
  error?: string;
};

function destFromHit(hit: {
  arrival_airport_code?: string;
  name?: string;
}): { code: string; name: string; label?: string; airport?: string } | null {
  const arrival = String(hit.arrival_airport_code ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(arrival)) return null;
  if (arrival === "IST" || arrival === "SAW") return null;

  const raw = String(hit.name ?? "")
    .replace(/\s*\([A-Z]{3}\)\s*$/, "")
    .trim();

  const tracked = findTrackedDestination(arrival);
  if (tracked) {
    const extra = tracked.extraAirports?.some((a) => a.code === arrival);
    return {
      code: tracked.code,
      name: tracked.name,
      ...(extra
        ? { airport: arrival, label: trackedDestinationLabel(tracked, arrival) }
        : {}),
    };
  }

  const fromName = destPhotoCode(raw) ?? destPhotoCode(arrival);
  if (fromName) {
    const canon = findTrackedDestination(fromName);
    return {
      code: canon?.code ?? fromName,
      name: canon?.name ?? (raw || fromName),
    };
  }

  return { code: arrival, name: raw || arrival };
}

function departureLabel(origin: string) {
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
    thumbnail?: string;
  },
  dest: { code: string; name: string; label?: string; airport?: string },
  foundAt: string,
  gate: { badge?: string; uiThreshold?: number; strikePrice?: number },
): Deal {
  const strike = gate.strikePrice;
  const threshold = gate.uiThreshold;
  const displayOff =
    strike != null
      ? Math.round(((strike - hit.price) / strike) * 100)
      : hit.discount;

  return {
    id: `gdeals:${dest.code}:${hit.origin}:${hit.outDate}:${hit.origin}:${hit.retDate}`,
    destination: dest.label ?? `${dest.name} (${dest.code})`,
    ...(dest.airport ? { destAirport: dest.airport } : {}),
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
    photoUrl: hit.thumbnail?.trim() || undefined,
    googleFlightsUrl: hit.link,
    departureLabel: departureLabel(hit.origin),
    foundAt,
    dealBadge:
      gate.badge === "MUTLAK_FIRSAT" || gate.badge === "SEZONLUK_DIP"
        ? gate.badge
        : undefined,
    verifiedAt: foundAt,
    lastCheckedAt: foundAt,
  };
}

function originForThisScan(now = new Date()): "IST" | "SAW" {
  const hour = new Date(now.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
  return hour % 2 === 0 ? "IST" : "SAW";
}

function isGoogleDeal(deal: Deal) {
  return deal.id.startsWith("gdeals:");
}

function googleAvgFromDeal(deal: Deal) {
  if (typeof deal.averagePrice !== "number" || deal.averagePrice <= 0) {
    return undefined;
  }
  // strike ≈ avg × 1.1 → avg ≈ strike / 1.1
  return deal.averagePrice / 1.1;
}

function destCodeFromDeal(deal: Deal) {
  if (deal.id.startsWith("gdeals:") || deal.id.startsWith("scrappa:")) {
    return deal.id.split(":")[1] ?? "";
  }
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

/** 28 şehir dışı Google ortalamaları; Scrappa yalnız `scrappa_oneway` okur, bu satırlara dokunmaz. */
export const GDEALS_BASELINE_SOURCE = "gdeals_baseline";

async function recordGoogleBaselines(
  admin: SupabaseClient,
  hits: Awaited<ReturnType<typeof fetchGoogleDeals>>["deals"],
) {
  try {
    const rows: ObservationRow[] = [];
    for (const hit of hits) {
      const dest = destFromHit(hit);
      if (!dest || findTrackedDestination(dest.code)) continue;
      const outDate = hit.outbound_date ?? hit.start_date ?? "";
      const retDate = hit.return_date ?? hit.end_date ?? "";
      const price = Number(hit.price);
      const average = Number(hit.average_price);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(outDate)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(retDate)) continue;
      if (!(price > 0) || !(average > 0)) continue;
      rows.push({
        route_key: routeKey(dest.code),
        season_key: seasonKey(new Date(`${outDate}T12:00:00Z`)),
        destination_code: dest.code,
        destination_name: dest.name,
        price: Math.round(price),
        currency: "USD",
        outbound_date: outDate,
        return_date: retDate,
        source: GDEALS_BASELINE_SOURCE,
        discount_percent: Number(hit.discount_percentage) || null,
        average_price: Math.round(average),
        airline: hit.airline ?? null,
        stops: typeof hit.stops === "number" ? hit.stops : null,
      });
    }
    const res = await insertObservations(admin, rows);
    if (!res.ok) console.warn("gdeals baseline kayıt hatası", res.error);
  } catch (e) {
    console.warn("gdeals baseline kayıt hatası", e);
  }
}

export async function runSerpapiDealsScan(
  admin: SupabaseClient | null,
): Promise<SerpapiDealsScanResult> {
  const today = turkeyTodayIso();
  const origin = originForThisScan();
  const fetched = await fetchGoogleDeals(origin);
  if (!fetched.ok) {
    return {
      ok: false,
      fetched: 0,
      matched: 0,
      added: 0,
      skippedDup: 0,
      skippedGate: 0,
      error: fetched.error,
    };
  }

  if (admin) await recordGoogleBaselines(admin, fetched.deals);

  const foundAt = new Date().toISOString();
  const matched: Deal[] = [];
  let skippedGate = 0;

  for (const hit of fetched.deals) {
    const dest = destFromHit(hit);
    if (!dest) continue;

    const outDate = hit.outbound_date ?? hit.start_date ?? "";
    const retDate = hit.return_date ?? hit.end_date ?? "";
    const price = Number(hit.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(outDate)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(retDate)) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    if (outDate < today) continue;

    if (typeof hit.stops === "number" && hit.stops > maxStopsForDest(dest.code)) {
      continue;
    }

    const average = Number(hit.average_price) || undefined;
    const gate = passesGoogleDealGates({
      price,
      average,
      destCode: dest.code,
      outDate,
    });
    if (!gate.ok) {
      skippedGate += 1;
      continue;
    }

    const hitOrigin =
      String(hit.departure_airport_code ?? "IST").toUpperCase() === "SAW" ? "SAW" : "IST";
    if (admin) {
      const own = await checkAgainstOwnOneWays(admin, {
        destCode: dest.code,
        airport: dest.airport,
        origin: hitOrigin,
        outDate,
        retDate,
        price,
      });
      if (!own.ok) {
        console.log(
          JSON.stringify({ tag: "gdeals-own-check-drop", dest: dest.code, origin: hitOrigin, outDate, retDate, price, ownSum: own.ownSum }),
        );
        skippedGate += 1;
        continue;
      }
    }

    matched.push(
      toShowcaseDeal(
        {
          price,
          average,
          discount: Number(hit.discount_percentage) || undefined,
          link: hit.flight_link,
          outDate,
          retDate,
          origin: hitOrigin,
          stops: typeof hit.stops === "number" ? hit.stops : undefined,
          airline: hit.airline,
          thumbnail: hit.thumbnail,
        },
        dest,
        foundAt,
        gate,
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
      skippedGate,
      error: "Supabase yok",
    };
  }

  const board = await readScanBoard(admin);
  const existingLive = (board.deals?.deals ?? []).filter((d) =>
    isLiveDeal(d, today),
  );

  const keptExisting: Deal[] = [];
  for (const deal of existingLive) {
    if (!isGoogleDeal(deal)) {
      keptExisting.push(deal);
      continue;
    }
    const code = destCodeFromDeal(deal);
    const outDate = deal.outboundDate ?? "";
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(outDate)) {
      skippedGate += 1;
      continue;
    }
    const gate = passesGoogleDealGates({
      price: deal.price,
      average: googleAvgFromDeal(deal),
      destCode: code,
      outDate,
    });
    if (!gate.ok) {
      skippedGate += 1;
      continue;
    }
    const [, , dealOrigin, , , retDate] = deal.id.split(":");
    if (dealOrigin && retDate) {
      const own = await checkAgainstOwnOneWays(admin, {
        destCode: code,
        airport: deal.destAirport,
        origin: dealOrigin,
        outDate,
        retDate,
        price: deal.price,
      });
      if (!own.ok) {
        console.log(
          JSON.stringify({ tag: "gdeals-own-check-drop", id: deal.id, price: deal.price, ownSum: own.ownSum }),
        );
        skippedGate += 1;
        continue;
      }
    }
    keptExisting.push(deal);
  }

  const byTrip = new Map(keptExisting.map((d) => [archiveTripKey(d), d]));
  const fresh: Deal[] = [];
  let skippedDup = 0;

  for (const deal of matched) {
    const key = archiveTripKey(deal);
    const prev = byTrip.get(key);
    if (prev) {
      skippedDup += 1;
      const cheaper = deal.price < prev.price;
      byTrip.set(key, {
        ...prev,
        price: cheaper ? deal.price : prev.price,
        averagePrice: cheaper ? deal.averagePrice : prev.averagePrice,
        thresholdPrice: cheaper ? deal.thresholdPrice : prev.thresholdPrice,
        discountPercent: cheaper ? deal.discountPercent : prev.discountPercent,
        dealBadge: cheaper ? deal.dealBadge : prev.dealBadge,
        lastCheckedAt: foundAt,
        photoUrl: prev.photoUrl || deal.photoUrl,
        airline: prev.airline || deal.airline,
        stops: typeof prev.stops === "number" ? prev.stops : deal.stops,
      });
      continue;
    }
    byTrip.set(key, deal);
    fresh.push(deal);
  }

  const { payload, live, previousLive } = foldShowcase(
    board.deals,
    foldOneCardPerCity([...byTrip.values()]),
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
      skippedGate,
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
    skippedGate,
  };
}
