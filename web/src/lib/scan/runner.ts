import { getDeals } from "@/lib/deals";
import { serpapiCityFare } from "@/lib/providers/serpapi";
import { searchapiCityFare } from "@/lib/providers/searchapi";
import { scrappaCityFare } from "@/lib/providers/scrappa";
import { writeCityFaresCache, fareToDeal } from "@/lib/scan/city-cache";
import { slidingTripDates, type ScannedFare } from "@/lib/scan/dates";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import {
  dealToObservation,
  fareToObservation,
  hybridDiscount,
  insertObservations,
  ownRouteAverage,
  type ObservationRow,
} from "@/lib/scan/observations";
import { applyPriceLevelFloor } from "@/lib/scan/price-insights";
import {
  getRouteBaseline,
  upsertRouteBaseline,
} from "@/lib/scan/route-baselines";
import {
  type CityRoute,
  type CronSlot,
  type ScanProvider,
  SCRAPPA_ROUTES,
  SEA_ROUTES,
  SERPAPI_CITY_ROUTES,
  providerForSeaSlot,
  slotRunsCities2x,
  slotRunsDeals,
  slotSeaIndex,
} from "@/lib/scan/routes";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function fetchCityFare(
  provider: ScanProvider,
  route: CityRoute,
  outbound: string,
  returnDate: string,
): Promise<ScannedFare | null> {
  const input = {
    destinationCode: route.code,
    destinationName: route.name,
    outbound,
    returnDate,
  };
  if (provider === "serpapi") return serpapiCityFare(input);
  if (provider === "searchapi") return searchapiCityFare(input);
  return scrappaCityFare(input);
}

async function scoreFare(
  admin: SupabaseClient,
  fare: ScannedFare,
  minDiscount: number,
): Promise<ScannedFare> {
  const own = await ownRouteAverage(admin, fare.destinationCode);
  const baseline = await getRouteBaseline(fare.destinationCode);
  const scored = hybridDiscount(
    fare.price,
    fare.discountPercent,
    fare.averagePrice,
    own ?? baseline,
  );

  let discountPercent = applyPriceLevelFloor(
    scored.discountPercent,
    fare.priceLevel,
    minDiscount,
  );
  const averagePrice = scored.averagePrice ?? baseline ?? undefined;

  if (fare.averagePrice && fare.averagePrice > 0) {
    await upsertRouteBaseline(
      fare.destinationCode,
      fare.averagePrice,
      fare.provider,
    );
  }

  if (discountPercent === undefined && averagePrice && averagePrice > 0) {
    discountPercent = Math.round(
      ((averagePrice - fare.price) / averagePrice) * 100,
    );
    discountPercent = applyPriceLevelFloor(
      discountPercent,
      fare.priceLevel,
      minDiscount,
    );
  }

  return {
    ...fare,
    discountPercent,
    averagePrice,
  };
}

export type ScanSlotResult = {
  slot: CronSlot;
  dealsFound: number;
  cityFaresFound: number;
  dipCandidates: Deal[];
  errors: string[];
  source: string;
};

export async function runScanSlot(
  admin: SupabaseClient,
  slot: CronSlot,
): Promise<ScanSlotResult> {
  const minDiscount = envNumber("MIN_DISCOUNT_PERCENT", 30);
  const errors: string[] = [];
  const observationRows: ObservationRow[] = [];
  const dipCandidates: Deal[] = [];
  let dealsFound = 0;
  let cityFaresFound = 0;
  let source = "none";

  if (slotRunsDeals(slot)) {
    try {
      const payload = await getDeals({ forceRefresh: true });
      source = payload.source;
      dealsFound = payload.deals.length;

      if (payload.source !== "demo") {
        const boardWrite = await patchScanBoard(admin, {
          deals: { ...payload, source: "cache" },
        });
        if (!boardWrite.ok && boardWrite.error) {
          errors.push(`scan_board deals: ${boardWrite.error}`);
        }

        for (const deal of payload.deals) {
          observationRows.push(dealToObservation(deal));
          if ((deal.discountPercent ?? 0) >= minDiscount) {
            dipCandidates.push(deal);
          }
          const code = deal.destination.match(/\b([A-Z]{3})\b/)?.[1];
          if (code && deal.averagePrice && deal.averagePrice > 0) {
            await upsertRouteBaseline(code, deal.averagePrice, "serpapi_deals");
          }
        }
      }
    } catch (err) {
      errors.push(
        `deals: ${err instanceof Error ? err.message : "bilinmeyen hata"}`,
      );
    }
  }

  const dates = slidingTripDates();
  const cityJobs: Array<{ route: CityRoute; provider: ScanProvider }> = [];

  if (slotRunsCities2x(slot)) {
    for (const route of SCRAPPA_ROUTES) {
      cityJobs.push({ route, provider: "scrappa" });
    }
    for (const route of SERPAPI_CITY_ROUTES) {
      cityJobs.push({ route, provider: "serpapi" });
    }
  }

  const seaIdx = slotSeaIndex(slot);
  if (seaIdx !== null) {
    const provider = providerForSeaSlot(seaIdx);
    for (const route of SEA_ROUTES) {
      cityJobs.push({ route, provider });
    }
  }

  const scanned: ScannedFare[] = [];

  cityJobs.sort((a, b) => {
    const rank = (p: ScanProvider) =>
      p === "scrappa" ? 2 : p === "searchapi" ? 1 : 0;
    return rank(a.provider) - rank(b.provider);
  });

  for (const job of cityJobs) {
    try {
      const raw = await fetchCityFare(
        job.provider,
        job.route,
        dates.outbound,
        dates.returnDate,
      );
      if (!raw) continue;
      const scored = await scoreFare(admin, raw, minDiscount);
      scanned.push(scored);
      observationRows.push(fareToObservation(scored));
      if ((scored.discountPercent ?? 0) >= minDiscount) {
        dipCandidates.push(fareToDeal(scored));
      }
    } catch (err) {
      errors.push(
        `${job.route.code}/${job.provider}: ${err instanceof Error ? err.message : "hata"}`,
      );
    }
  }

  cityFaresFound = scanned.length;
  if (scanned.length > 0) {
    const board = await readScanBoard(admin);
    const cityPayload = await writeCityFaresCache(
      scanned,
      board.cityFares?.fares,
    );
    const boardWrite = await patchScanBoard(admin, {
      cityFares: cityPayload,
    });
    if (!boardWrite.ok && boardWrite.error) {
      errors.push(`scan_board cities: ${boardWrite.error}`);
    }
  }

  const obs = await insertObservations(admin, observationRows);
  if (!obs.ok && obs.error) {
    errors.push(`observations: ${obs.error}`);
  }

  const uniq = new Map<string, Deal>();
  for (const d of dipCandidates) {
    const key = `${d.destination}|${d.outboundDate}|${d.returnDate}|${d.price}`;
    if (!uniq.has(key)) uniq.set(key, d);
  }

  return {
    slot,
    dealsFound,
    cityFaresFound,
    dipCandidates: [...uniq.values()],
    errors,
    source,
  };
}
