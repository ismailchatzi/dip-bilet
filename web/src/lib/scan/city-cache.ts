import { promises as fs } from "fs";
import path from "path";
import type { ScannedFare } from "@/lib/scan/dates";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import type { Deal, DealsPayload } from "@/lib/types";

const CITY_CACHE = path.join(process.cwd(), ".cache", "city-fares.json");

export type CityFaresPayload = {
  fetchedAt: string;
  fares: ScannedFare[];
};

export async function readCityFaresCache(
  maxAgeHours: number,
): Promise<CityFaresPayload | null> {
  try {
    const raw = await fs.readFile(CITY_CACHE, "utf8");
    const data = JSON.parse(raw) as CityFaresPayload;
    const ageMs = Date.now() - new Date(data.fetchedAt).getTime();
    const maxMs = maxAgeHours * 60 * 60 * 1000;
    if (Number.isNaN(ageMs) || ageMs > maxMs) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeCityFaresCache(
  fares: ScannedFare[],
): Promise<CityFaresPayload> {
  const existing = await readCityFaresCache(24 * 14);
  const byCode = new Map<string, ScannedFare>();
  for (const f of existing?.fares ?? []) {
    byCode.set(f.destinationCode, f);
  }
  for (const f of fares) {
    byCode.set(f.destinationCode, f);
  }
  const payload: CityFaresPayload = {
    fetchedAt: new Date().toISOString(),
    fares: [...byCode.values()],
  };
  await fs.mkdir(path.dirname(CITY_CACHE), { recursive: true });
  await fs.writeFile(CITY_CACHE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function fareToDeal(fare: ScannedFare): Deal {
  return {
    id: `${fare.destinationCode}-${fare.outboundDate}-${fare.price}`,
    destination: fare.destinationName,
    price: fare.price,
    averagePrice: fare.averagePrice,
    discountPercent: fare.discountPercent,
    currency: fare.currency || "TRY",
    outboundDate: fare.outboundDate,
    returnDate: fare.returnDate,
    airline: fare.airline,
    stops: fare.stops,
    googleFlightsUrl: fare.googleFlightsUrl,
    departureLabel: DEPARTURE_LABEL,
  };
}

/** Panel: deals + şehir dipleri birleşik */
export function mergeDealsAndFares(
  deals: DealsPayload,
  cityFares: CityFaresPayload | null,
  minDiscount: number,
): DealsPayload {
  const fromCities = (cityFares?.fares ?? [])
    .map(fareToDeal)
    .filter((d) => (d.discountPercent ?? 0) >= minDiscount);

  const byId = new Map<string, Deal>();
  for (const d of [...deals.deals, ...fromCities]) {
    const prev = byId.get(d.id);
    if (!prev || (d.discountPercent ?? 0) > (prev.discountPercent ?? 0)) {
      byId.set(d.id, d);
    }
  }

  const merged = [...byId.values()].sort(
    (a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
  );

  return {
    ...deals,
    deals: merged,
    fetchedAt: cityFares?.fetchedAt
      ? new Date(
          Math.max(
            new Date(deals.fetchedAt).getTime(),
            new Date(cityFares.fetchedAt).getTime(),
          ),
        ).toISOString()
      : deals.fetchedAt,
  };
}
