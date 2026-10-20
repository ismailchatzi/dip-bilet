import { stayRange } from "@/lib/scan/trip-rules";

export type SerpapiDealHit = {
  name?: string;
  country?: string;
  price?: number;
  average_price?: number;
  discount_percentage?: number;
  flight_link?: string;
  start_date?: string;
  end_date?: string;
  outbound_date?: string;
  return_date?: string;
  departure_airport_code?: string;
  arrival_airport_code?: string;
  stops?: number;
  airline?: string;
  thumbnail?: string;
};

export type GoogleDealsProvider = "serpapi" | "searchapi";

type SerpapiDealsJson = {
  error?: string;
  deals?: SerpapiDealHit[];
};

type SearchapiDealRaw = {
  price?: number;
  typical_price?: number;
  savings_percentage?: number;
  booking_link?: string;
  outbound_date?: string;
  return_date?: string;
  trip_length_days?: number;
  stops?: number;
  airline?: string;
  airline_code?: string;
  is_multiple_airlines?: boolean;
  origin?: { airport_code?: string };
  destination?: {
    name?: string;
    country?: string;
    airport_code?: string;
    image?: string;
  };
};

function searchapiAirline(hit: SearchapiDealRaw): string | undefined {
  const name = hit.airline?.trim();
  if (name) return name;
  if (hit.is_multiple_airlines) return "Birden fazla havayolu";
  const code = hit.airline_code?.trim();
  return code || undefined;
}

type SearchapiDealsJson = {
  error?: string;
  deals?: SearchapiDealRaw[];
};

function nightsBetween(outDate: string, retDate: string): number | null {
  const a = Date.parse(`${outDate}T12:00:00Z`);
  const b = Date.parse(`${retDate}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Konaklama: uzak/tropik 7–14, diğer 4–10 (`stayRange`). */
function withinStayWindow(
  destCode?: string,
  outDate?: string,
  retDate?: string,
  tripDays?: number,
) {
  const [minN, maxN] = stayRange(destCode ?? "");
  if (typeof tripDays === "number" && Number.isFinite(tripDays)) {
    return tripDays >= minN && tripDays <= maxN;
  }
  if (!outDate || !retDate) return false;
  const nights = nightsBetween(outDate, retDate);
  return nights != null && nights >= minN && nights <= maxN;
}

function normalizeSearchapiDeals(raw: SearchapiDealRaw[]): SerpapiDealHit[] {
  const out: SerpapiDealHit[] = [];
  for (const hit of raw) {
    const outDate = hit.outbound_date ?? "";
    const retDate = hit.return_date ?? "";
    const dest = hit.destination?.airport_code;
    if (!withinStayWindow(dest, outDate, retDate, hit.trip_length_days)) continue;
    out.push({
      name: hit.destination?.name,
      country: hit.destination?.country,
      price: hit.price,
      average_price: hit.typical_price,
      discount_percentage: hit.savings_percentage,
      flight_link: hit.booking_link,
      outbound_date: outDate || undefined,
      return_date: retDate || undefined,
      start_date: outDate || undefined,
      end_date: retDate || undefined,
      departure_airport_code: hit.origin?.airport_code,
      arrival_airport_code: hit.destination?.airport_code,
      stops: hit.stops,
      airline: searchapiAirline(hit),
      thumbnail: hit.destination?.image,
    });
  }
  return out;
}

async function fetchFromSerpapi(
  departureId: "IST" | "SAW",
  apiKey: string,
): Promise<{ ok: boolean; deals: SerpapiDealHit[]; error?: string }> {
  const params = new URLSearchParams({
    engine: "google_flights_deals",
    departure_id: departureId,
    type: "1",
    trip_length: "4,14",
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
  const deals = (json.deals ?? []).filter((d) =>
    withinStayWindow(
      d.arrival_airport_code,
      d.outbound_date ?? d.start_date,
      d.return_date ?? d.end_date,
    ),
  );
  return { ok: true, deals };
}

async function fetchFromSearchapi(
  departureId: "IST" | "SAW",
  apiKey: string,
): Promise<{ ok: boolean; deals: SerpapiDealHit[]; error?: string }> {
  const params = new URLSearchParams({
    engine: "google_flights_deals",
    departure_id: departureId,
    flight_type: "round_trip",
    currency: "USD",
    gl: "tr",
    hl: "tr",
    api_key: apiKey,
  });

  const res = await fetch(`https://www.searchapi.io/api/v1/search?${params}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as SearchapiDealsJson;
  if (!res.ok || json.error) {
    return {
      ok: false,
      deals: [],
      error: json.error || `HTTP ${res.status}`,
    };
  }
  return { ok: true, deals: normalizeSearchapiDeals(json.deals ?? []) };
}

export function googleDealsProviderPreference(): GoogleDealsProvider | "auto" {
  const raw = process.env.GOOGLE_DEALS_PROVIDER?.trim().toLowerCase();
  if (raw === "searchapi" || raw === "serpapi") return raw;
  return "auto";
}

/**
 * Tek havalimanı + konaklama stayRange (4–10 / uzak-tropik 7–14). IST,SAW birleşik boş. 1 hak.
 * `provider` verilirse yalnız o kaynak; yoksa GOOGLE_DEALS_PROVIDER / auto (SerpApi → SearchApi).
 */
export async function fetchGoogleDeals(
  departureId: "IST" | "SAW" = "IST",
  opts?: { provider?: GoogleDealsProvider },
): Promise<{
  ok: boolean;
  deals: SerpapiDealHit[];
  provider?: GoogleDealsProvider;
  error?: string;
}> {
  const serpKey = process.env.SERPAPI_API_KEY?.trim();
  const searchKey = process.env.SEARCHAPI_API_KEY?.trim();
  const prefer = opts?.provider ?? googleDealsProviderPreference();

  const trySerpapi = async () => {
    if (!serpKey) return { ok: false as const, deals: [] as SerpapiDealHit[], error: "SERPAPI_API_KEY eksik" };
    const r = await fetchFromSerpapi(departureId, serpKey);
    return { ...r, provider: "serpapi" as const };
  };

  const trySearchapi = async () => {
    if (!searchKey) {
      return { ok: false as const, deals: [] as SerpapiDealHit[], error: "SEARCHAPI_API_KEY eksik" };
    }
    const r = await fetchFromSearchapi(departureId, searchKey);
    return { ...r, provider: "searchapi" as const };
  };

  if (prefer === "searchapi") return trySearchapi();
  if (prefer === "serpapi") return trySerpapi();

  if (serpKey) {
    const serp = await trySerpapi();
    if (serp.ok) return serp;
    if (searchKey) {
      console.warn("serpapi-deals → searchapi fallback", serp.error);
      return trySearchapi();
    }
    return serp;
  }

  if (searchKey) return trySearchapi();
  return { ok: false, deals: [], error: "SERPAPI_API_KEY / SEARCHAPI_API_KEY eksik" };
}
