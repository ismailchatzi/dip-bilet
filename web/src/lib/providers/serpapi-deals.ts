export type SerpapiDealHit = {
  name?: string;
  country?: string;
  price?: number;
  average_price?: number;
  discount_percentage?: number;
  flight_link?: string;
  start_date?: string;
  end_date?: string;
  departure_airport_code?: string;
  arrival_airport_code?: string;
  stops?: number;
  airline?: string;
};

type SerpapiDealsJson = {
  error?: string;
  deals?: SerpapiDealHit[];
};

/** IST+SAW gidiş-dönüş. Tarih/gece filtresi yok; Google ne sunduysa o. 1 hak. */
export async function fetchGoogleDeals(): Promise<{
  ok: boolean;
  deals: SerpapiDealHit[];
  error?: string;
}> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) return { ok: false, deals: [], error: "SERPAPI_API_KEY eksik" };

  const params = new URLSearchParams({
    engine: "google_flights_deals",
    departure_id: "IST,SAW",
    type: "1",
    currency: "USD",
    gl: "tr",
    hl: "tr",
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as SerpapiDealsJson;
  if (!res.ok || json.error) {
    return {
      ok: false,
      deals: [],
      error: json.error || `HTTP ${res.status}`,
    };
  }
  return { ok: true, deals: json.deals ?? [] };
}
