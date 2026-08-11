import type { ScannedFare } from "@/lib/scan/dates";
import { parsePriceInsights } from "@/lib/scan/price-insights";

type FlightsInput = {
  destinationCode: string;
  destinationName: string;
  outbound: string;
  returnDate: string;
};

/** SearchApi google_flights + price_insights */
export async function searchapiCityFare(
  input: FlightsInput,
): Promise<ScannedFare | null> {
  const apiKey = process.env.SEARCHAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("SEARCHAPI_API_KEY eksik");

  const params = new URLSearchParams({
    engine: "google_flights",
    api_key: apiKey,
    departure_id: "IST",
    arrival_id: input.destinationCode,
    outbound_date: input.outbound,
    return_date: input.returnDate,
    flight_type: "round_trip",
    currency: "TRY",
    hl: "tr",
    gl: "tr",
  });

  const res = await fetch(`https://www.searchapi.io/api/v1/search?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SearchApi HTTP ${res.status}`);
  const json = (await res.json()) as {
    error?: string;
    best_flights?: Array<{
      price?: number;
      airline?: string;
      flights?: Array<{ airline?: string }>;
      layovers?: unknown[];
    }>;
    other_flights?: Array<{
      price?: number;
      airline?: string;
      flights?: Array<{ airline?: string }>;
      layovers?: unknown[];
    }>;
    search_metadata?: { google_flights_url?: string };
    price_insights?: unknown;
  };

  if (json.error) throw new Error(json.error);

  const pool = [...(json.best_flights ?? []), ...(json.other_flights ?? [])];
  const priced = pool
    .map((f) => ({
      price: f.price,
      airline: f.airline || f.flights?.[0]?.airline,
      stops: f.layovers?.length ?? 0,
    }))
    .filter((f) => typeof f.price === "number" && f.price! > 0)
    .sort((a, b) => a.price! - b.price!);

  const best = priced[0];
  if (!best || typeof best.price !== "number") return null;

  const insights = parsePriceInsights(json.price_insights, best.price);

  return {
    provider: "searchapi",
    destinationCode: input.destinationCode,
    destinationName: input.destinationName,
    price: best.price,
    currency: "TRY",
    outboundDate: input.outbound,
    returnDate: input.returnDate,
    airline: best.airline,
    stops: best.stops,
    googleFlightsUrl: json.search_metadata?.google_flights_url,
    averagePrice: insights.averagePrice,
    discountPercent: insights.discountPercent,
    priceLevel: insights.priceLevel,
  };
}
