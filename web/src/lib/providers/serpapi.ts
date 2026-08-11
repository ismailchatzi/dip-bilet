import type { ScannedFare } from "@/lib/scan/dates";
import { parsePriceInsights } from "@/lib/scan/price-insights";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";

type FlightsInput = {
  destinationCode: string;
  destinationName: string;
  outbound: string;
  returnDate: string;
};

function pickCheapest(
  flights: Array<{
    price?: number;
    airline?: string;
    stops?: number;
    total_duration_minutes?: number;
  }>,
): { price: number; airline?: string; stops?: number } | null {
  const priced = flights
    .filter((f) => typeof f.price === "number" && f.price! > 0)
    .sort((a, b) => a.price! - b.price!);
  const best = priced[0];
  if (!best || typeof best.price !== "number") return null;
  return {
    price: best.price,
    airline: best.airline,
    stops: best.stops,
  };
}

/** SerpApi google_flights — en ucuz gidiş-dönüş + price_insights */
export async function serpapiCityFare(
  input: FlightsInput,
): Promise<ScannedFare | null> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("SERPAPI_API_KEY eksik");

  const params = new URLSearchParams({
    engine: "google_flights",
    api_key: apiKey,
    departure_id: "IST",
    arrival_id: input.destinationCode,
    outbound_date: input.outbound,
    return_date: input.returnDate,
    currency: "TRY",
    hl: "tr",
    gl: "tr",
    type: "1",
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SerpApi flights HTTP ${res.status}`);
  const json = (await res.json()) as {
    error?: string;
    best_flights?: Array<{
      price?: number;
      total_duration?: number;
      flights?: Array<{ airline?: string }>;
      layovers?: unknown[];
    }>;
    other_flights?: Array<{
      price?: number;
      flights?: Array<{ airline?: string }>;
      layovers?: unknown[];
    }>;
    google_flights_url?: string;
    price_insights?: unknown;
  };

  if (json.error) throw new Error(json.error);

  const pool = [...(json.best_flights ?? []), ...(json.other_flights ?? [])];
  const mapped = pool.map((f) => ({
    price: f.price,
    airline: f.flights?.[0]?.airline,
    stops: f.layovers?.length ?? 0,
  }));
  const best = pickCheapest(mapped);
  if (!best) return null;

  const insights = parsePriceInsights(json.price_insights, best.price);

  return {
    provider: "serpapi",
    destinationCode: input.destinationCode,
    destinationName: input.destinationName,
    price: best.price,
    currency: "TRY",
    outboundDate: input.outbound,
    returnDate: input.returnDate,
    airline: best.airline,
    stops: best.stops,
    googleFlightsUrl: json.google_flights_url,
    averagePrice: insights.averagePrice,
    discountPercent: insights.discountPercent,
    priceLevel: insights.priceLevel,
  };
}

export async function serpapiDealsBundle(): Promise<{
  departureLabel: string;
  deals: Array<{
    destination: string;
    country?: string;
    price: number;
    averagePrice?: number;
    discountPercent?: number;
    outboundDate?: string;
    returnDate?: string;
    airline?: string;
    stops?: number;
    googleFlightsUrl?: string;
    destinationCode?: string;
  }>;
}> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("SERPAPI_API_KEY eksik");

  const durations = ["1", "2"] as const; // week + weekend
  const byKey = new Map<
    string,
    {
      destination: string;
      country?: string;
      price: number;
      averagePrice?: number;
      discountPercent?: number;
      outboundDate?: string;
      returnDate?: string;
      airline?: string;
      stops?: number;
      googleFlightsUrl?: string;
      destinationCode?: string;
    }
  >();

  let departureLabel = DEPARTURE_LABEL;

  for (const travel_duration of durations) {
    const params = new URLSearchParams({
      engine: "google_flights_deals",
      api_key: apiKey,
      departure_id: "IST,SAW",
      currency: "TRY",
      hl: "tr",
      gl: "tr",
      type: "1",
      travel_duration,
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SerpApi deals HTTP ${res.status}`);
    const json = (await res.json()) as {
      error?: string;
      departure?: { city?: string; airport_name?: string };
      deals?: Array<{
        price?: number;
        average_price?: number;
        discount_percentage?: number;
        destination?: string;
        destination_airport?: string;
        destination_airport_code?: string;
        country?: string;
        outbound_date?: string;
        return_date?: string;
        start_date?: string;
        end_date?: string;
        airline?: string;
        stops?: number;
        google_flights_url?: string;
        flight_link?: string;
        link?: string;
      }>;
    };
    if (json.error) throw new Error(json.error);
    departureLabel =
      json.departure?.city ||
      json.departure?.airport_name ||
      departureLabel;

    for (const d of json.deals ?? []) {
      if (typeof d.price !== "number") continue;
      const destination =
        d.destination ||
        d.destination_airport ||
        d.destination_airport_code ||
        "Bilinmeyen";
      const outboundDate = d.outbound_date || d.start_date;
      const returnDate = d.return_date || d.end_date;
      const key = `${destination}|${outboundDate}|${returnDate}|${d.price}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        destination,
        country: d.country,
        price: d.price,
        averagePrice: d.average_price,
        discountPercent: d.discount_percentage,
        outboundDate,
        returnDate,
        airline: d.airline,
        stops: d.stops,
        googleFlightsUrl:
          d.google_flights_url || d.flight_link || d.link,
        destinationCode: d.destination_airport_code,
      });
    }
  }

  return { departureLabel, deals: [...byKey.values()] };
}
