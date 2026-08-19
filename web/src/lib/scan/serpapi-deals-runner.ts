import { notifyNewDeals } from "@/lib/notify-new-deals";
import { foldOneCardPerCity } from "@/lib/deal-display";
import { fetchGoogleDeals } from "@/lib/providers/serpapi-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { archiveTripKey, foldShowcase, isLiveDeal } from "@/lib/scan/deal-archive";
import {
  passesGoogleDealGates,
  scrappaCityPackageMedian,
} from "@/lib/scan/google-deals-gates";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import { maxStopsForDest, turkeyTodayIso } from "@/lib/scan/trip-rules";
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
  skippedGate: number;
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

  // Takip edilmeyen havalimanlarında bile (örn. LHR/STN) kart üretmeye devam et.
  // Tekilleştirme/vitrin birleştirme `dealCityKey` üzerinden yapılıyor.
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
    thumbnail?: string;
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
    photoUrl: hit.thumbnail?.trim() || undefined,
    googleFlightsUrl: hit.link,
    departureLabel: departureLabel(hit.origin),
    foundAt,
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
  return deal.averagePrice / STRIKE_RATIO;
}

function destCodeFromDeal(deal: Deal) {
  if (deal.id.startsWith("gdeals:") || deal.id.startsWith("scrappa:")) {
    return deal.id.split(":")[1] ?? "";
  }
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
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

  const foundAt = new Date().toISOString();
  const medianCache = new Map<string, number | null>();
  const matched: Deal[] = [];
  let skippedGate = 0;

  async function medianFor(destCode: string, outDate: string) {
    if (!admin) return null;
    const season = outDate.slice(0, 7);
    const key = `${destCode}|${season}`;
    if (medianCache.has(key)) return medianCache.get(key) ?? null;
    const m = await scrappaCityPackageMedian(admin, destCode, season);
    medianCache.set(key, m);
    return m;
  }

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
    const scrappaM = await medianFor(dest.code, outDate);
    const gate = passesGoogleDealGates({
      price,
      average,
      destCode: dest.code,
      outDate,
      scrappaM,
    });
    if (!gate.ok) {
      skippedGate += 1;
      continue;
    }

    const hitOrigin = String(hit.departure_airport_code ?? "IST").toUpperCase();
    matched.push(
      toShowcaseDeal(
        {
          price,
          average,
          discount: Number(hit.discount_percentage) || undefined,
          link: hit.flight_link,
          outDate,
          retDate,
          origin: hitOrigin === "SAW" ? "SAW" : "IST",
          stops: typeof hit.stops === "number" ? hit.stops : undefined,
          airline: hit.airline,
          thumbnail: hit.thumbnail,
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
      skippedGate,
      error: "Supabase yok",
    };
  }

  const board = await readScanBoard(admin);
  const existingLive = (board.deals?.deals ?? []).filter((d) =>
    isLiveDeal(d, today),
  );

  // Eski Google kartlarını da aynı kapıdan geçir (saçma $1988 vb. temizlensin).
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
      scrappaM: await medianFor(code, outDate),
    });
    if (!gate.ok) {
      skippedGate += 1;
      continue;
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
      byTrip.set(key, {
        ...prev,
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
