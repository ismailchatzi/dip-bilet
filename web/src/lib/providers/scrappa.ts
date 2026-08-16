import { maxStopsForDest, scrappaMaxStopsParam } from "@/lib/scan/trip-rules";

type ScrappaLeg = {
  airline?: string;
  airline_code?: string;
  flight_number?: string | number;
  number?: string | number;
  stops?: number;
  self_transfer?: boolean;
};

type ScrappaFlight = {
  price?: number;
  currency?: string;
  airline?: string;
  airline_code?: string;
  airline_name?: string;
  flight_number?: string | number;
  booking_token?: string;
  bookingToken?: string;
  token?: string;
  stops?: number;
  total_duration_minutes?: number;
  self_transfer?: boolean;
  is_self_transfer?: boolean;
  separate_tickets?: boolean;
  extensions?: string[];
  legs?: ScrappaLeg[];
};

function flightStops(f: ScrappaFlight) {
  if (typeof f.stops === "number") return f.stops;
  if (typeof f.legs?.[0]?.stops === "number") return f.legs[0].stops;
  return null;
}

function flightSelfTransfer(f: ScrappaFlight) {
  if (f.self_transfer || f.is_self_transfer || f.separate_tickets) return true;
  if (f.legs?.some((l) => l.self_transfer)) return true;
  const blob = [...(f.extensions ?? []), JSON.stringify(f.legs ?? [])]
    .join(" ")
    .toLowerCase();
  return (
    blob.includes("self_transfer") ||
    blob.includes("self-transfer") ||
    blob.includes("yolcu sorumluluğunda")
  );
}

function pickCheapest(flights: ScrappaFlight[], maxStops: number) {
  const priced = flights
    .filter((f) => typeof f.price === "number" && f.price! > 0)
    .filter((f) => {
      const stops = flightStops(f);
      return stops == null || stops <= maxStops;
    })
    .sort((a, b) => a.price! - b.price!);
  return priced[0] ?? null;
}

export class ScrappaUnavailableError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string) {
    super(`Scrappa Google oturumu yok (${reason || status})`);
    this.name = "ScrappaUnavailableError";
    this.status = status;
    this.reason = reason;
  }
}

export type ScrappaOneWay = {
  origin: string;
  destination: string;
  date: string;
  price: number;
  currency: string;
  airline?: string;
  stops?: number;
  durationMin?: number;
  selfTransfer?: boolean;
  bookingToken?: string;
  airlineCode?: string;
  flightNumber?: string;
};

function trackedCity(origin: string, destination: string) {
  if (origin === "IST" || origin === "SAW") return destination;
  return origin;
}

function firstText(...vals: unknown[]) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function iataAirline(...vals: unknown[]) {
  for (const v of vals) {
    if (typeof v !== "string") continue;
    const t = v.trim().toUpperCase();
    if (/^[A-Z0-9]{2}$/.test(t)) return t;
    const m = t.match(/^([A-Z0-9]{2})\s*\d/);
    if (m) return m[1];
  }
  return undefined;
}

function bookingIdentity(best: ScrappaFlight) {
  const leg = best.legs?.[0];
  const token = firstText(best.booking_token, best.bookingToken, best.token);
  const airlineCode = iataAirline(
    best.airline_code,
    best.airline,
    leg?.airline_code,
    leg?.airline,
    firstText(best.flight_number, leg?.flight_number),
  );
  let flightNumber = firstText(
    best.flight_number,
    leg?.flight_number,
    leg?.number,
  );
  if (flightNumber && airlineCode && flightNumber.toUpperCase().startsWith(airlineCode)) {
    flightNumber = flightNumber.slice(airlineCode.length).replace(/^\s+/, "");
  }
  flightNumber = flightNumber?.replace(/\s+/g, "");
  return { token, airlineCode, flightNumber };
}

function toFare(
  input: { origin: string; destination: string; date: string },
  best: ScrappaFlight,
): ScrappaOneWay {
  const stops = flightStops(best);
  const id = bookingIdentity(best);
  return {
    origin: input.origin,
    destination: input.destination,
    date: input.date,
    price: best.price!,
    currency: "USD",
    airline: best.airline_name || best.legs?.[0]?.airline || id.airlineCode,
    stops: stops ?? undefined,
    durationMin: best.total_duration_minutes,
    selfTransfer: flightSelfTransfer(best) || undefined,
    bookingToken: id.token,
    airlineCode: id.airlineCode,
    flightNumber: id.flightNumber,
  };
}

function walkPrices(node: unknown, into: number[]) {
  if (typeof node === "number" && node > 0 && node < 50_000) {
    into.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkPrices(item, into);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (/price|amount|total|fare/i.test(key)) walkPrices(value, into);
    else if (value && typeof value === "object") walkPrices(value, into);
  }
}

function fareLooksSelfTransfer(node: unknown) {
  const blob = JSON.stringify(node).toLowerCase();
  return (
    blob.includes("kiwi") ||
    blob.includes("edreams") ||
    blob.includes("gotogate") ||
    blob.includes("mytrip") ||
    blob.includes("self_transfer") ||
    blob.includes("self-transfer") ||
    blob.includes("separate")
  );
}

/** Liste fiyatı yerine satıcı min (Kiwi vb.). +1 kredi. Başarısızsa liste kalır. */
export async function scrappaCheapestBookingPrice(input: {
  origin: string;
  destination: string;
  departureDate: string;
  listPrice: number;
  bookingToken?: string;
  airlineCode?: string;
  flightNumber?: string;
}): Promise<{ price: number; selfTransfer?: boolean }> {
  const apiKey = process.env.SCRAPPA_API_KEY?.trim();
  const token = input.bookingToken?.trim();
  const airline = input.airlineCode?.trim();
  const flightNumber = input.flightNumber?.trim();
  if (!apiKey || !token || !airline || !flightNumber) {
    return { price: input.listPrice };
  }

  const params = new URLSearchParams({
    booking_token: token,
    origin: input.origin,
    destination: input.destination,
    departure_date: input.departureDate,
    airline,
    flight_number: flightNumber,
    currency: "USD",
    hl: "tr",
    gl: "tr",
  });

  try {
    const res = await fetch(
      `https://scrappa.co/api/flights/booking-details?${params}`,
      {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { price: input.listPrice };
    const json = (await res.json()) as {
      fare_options?: unknown;
      price_insights?: unknown;
    };
    const prices: number[] = [];
    walkPrices(json.fare_options ?? json, prices);
    const floor = input.listPrice * 0.6;
    const cheaper = prices.filter((p) => p >= floor && p < input.listPrice);
    if (cheaper.length === 0) return { price: input.listPrice };
    const min = Math.min(...cheaper);
    return {
      price: min,
      selfTransfer: fareLooksSelfTransfer(json.fare_options) || undefined,
    };
  } catch {
    return { price: input.listPrice };
  }
}

async function readScrappaJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as {
      flights?: ScrappaFlight[];
      error?: string;
      message?: string;
      failed_stage?: string;
      last_failure_reason?: string;
    };
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/** Tek yön en ucuz — sort_by=cheapest. Sayı USD (TRY etiketi yalan). */
export async function scrappaOneWay(input: {
  origin: string;
  destination: string;
  date: string;
}): Promise<ScrappaOneWay | null> {
  const apiKey = process.env.SCRAPPA_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPPA_API_KEY eksik");
  const city = trackedCity(input.origin, input.destination);
  const maxStops = maxStopsForDest(city);

  const params = new URLSearchParams({
    origin: input.origin,
    destination: input.destination,
    departure_date: input.date,
    currency: "USD",
    hl: "tr",
    gl: "tr",
    sort_by: "cheapest",
    max_stops: scrappaMaxStopsParam(city),
  });

  let lastStatus = 0;
  let lastReason = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `https://scrappa.co/api/flights/one-way?${params}`,
      {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
        cache: "no-store",
      },
    );
    lastStatus = res.status;
    const json = await readScrappaJson(res);
    lastReason =
      json.last_failure_reason ||
      json.failed_stage ||
      json.error ||
      json.message ||
      "";

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (res.status === 503) {
      throw new ScrappaUnavailableError(503, lastReason);
    }
    if (!res.ok) {
      throw new Error(`Scrappa one-way HTTP ${res.status}: ${lastReason}`);
    }
    if (json.error || json.message?.toLowerCase().includes("error")) {
      throw new Error(json.error || json.message || "Scrappa one-way hata");
    }
    const best = pickCheapest(json.flights ?? [], maxStops);
    if (!best || typeof best.price !== "number") return null;
    return toFare(input, best);
  }
  throw new Error(`Scrappa one-way retry bitti HTTP ${lastStatus} ${lastReason}`);
}

/** Gidiş-dönüş paket fiyatı — sort_by=cheapest (En iyi değil). */
export async function scrappaRoundTrip(input: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
}): Promise<ScrappaOneWay | null> {
  const apiKey = process.env.SCRAPPA_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPPA_API_KEY eksik");
  const maxStops = maxStopsForDest(input.destination);

  const params = new URLSearchParams({
    origin: input.origin,
    destination: input.destination,
    departure_date: input.departureDate,
    return_date: input.returnDate,
    currency: "USD",
    hl: "tr",
    gl: "tr",
    sort_by: "cheapest",
    max_stops: scrappaMaxStopsParam(input.destination),
  });
  let lastStatus = 0;
  let lastReason = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `https://scrappa.co/api/flights/round-trip?${params}`,
      {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
        cache: "no-store",
      },
    );
    lastStatus = res.status;
    const json = await readScrappaJson(res);
    lastReason =
      json.last_failure_reason ||
      json.failed_stage ||
      json.error ||
      json.message ||
      "";
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (res.status === 503) {
      throw new ScrappaUnavailableError(503, lastReason);
    }
    if (!res.ok) {
      throw new Error(`Scrappa round-trip HTTP ${res.status}: ${lastReason}`);
    }
    if (json.error || json.message?.toLowerCase().includes("error")) {
      throw new Error(json.error || json.message || "Scrappa round-trip hata");
    }
    const best = pickCheapest(json.flights ?? [], maxStops);
    if (!best || typeof best.price !== "number") return null;
    return toFare(
      {
        origin: input.origin,
        destination: input.destination,
        date: input.departureDate,
      },
      best,
    );
  }
  throw new Error(
    `Scrappa round-trip retry bitti HTTP ${lastStatus} ${lastReason}`,
  );
}
