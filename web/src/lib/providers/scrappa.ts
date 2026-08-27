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

/** Cloudflare bot imzasını yumuşat — istek gövdesi/parametreler aynı. */
function scrappaHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    "x-api-key": apiKey,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function numPrice(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 50_000) {
    return v;
  }
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v);
    if (n > 0 && n < 50_000) return n;
  }
  return null;
}

/** Sadece o uçuşun satıcı toplamı — dip/insights/tek yön rakamına dokunma. */
function optionTotal(opt: unknown): number | null {
  const o = asRecord(opt);
  if (!o) return null;
  const together = asRecord(o.together);
  const booking = asRecord(o.booking);
  for (const v of [
    o.price,
    o.total_price,
    o.totalPrice,
    together?.price,
    together?.total_price,
    booking?.price,
  ]) {
    const n = numPrice(v);
    if (n != null) return n;
  }
  return null;
}

function fareOptionTotals(fareOptions: unknown): number[] {
  const lists: unknown[][] = [];
  if (Array.isArray(fareOptions)) lists.push(fareOptions);
  const rec = asRecord(fareOptions);
  if (rec) {
    for (const key of ["fare_options", "options", "bookings", "booking_options"]) {
      const v = rec[key];
      if (Array.isArray(v)) lists.push(v);
    }
  }
  const out: number[] = [];
  for (const list of lists) {
    for (const item of list) {
      const n = optionTotal(item);
      if (n != null) out.push(n);
    }
  }
  return out;
}

/**
 * Google En ucuz = aynı uçuşun en ucuz satıcısı (95→91 Kiwi).
 * JSON’daki 70$ “tipik/dip” değil. Listeye göre en fazla %15 altı.
 */
export async function scrappaCheapestBookingPrice(input: {
  origin: string;
  destination: string;
  departureDate: string;
  listPrice: number;
  bookingToken?: string;
  airlineCode?: string;
  flightNumber?: string;
}): Promise<{ price: number }> {
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

  const res = await fetch(
    `https://scrappa.co/api/flights/booking-details?${params}`,
    {
      headers: scrappaHeaders(apiKey),
      cache: "no-store",
    },
  );
  if (res.status === 503) {
    const json = await readScrappaJson(res);
    const reason =
      json.last_failure_reason ||
      json.failed_stage ||
      json.error ||
      json.message ||
      "booking_details_unavailable";
    throw new ScrappaUnavailableError(503, reason);
  }
  if (!res.ok) return { price: input.listPrice };
  try {
    const json = (await res.json()) as { fare_options?: unknown };
    const prices = fareOptionTotals(json.fare_options);
    const floor = input.listPrice * 0.85;
    const sellers = prices.filter(
      (p) => p >= floor && p <= input.listPrice + 0.5,
    );
    if (sellers.length === 0) return { price: input.listPrice };
    return { price: Math.min(...sellers) };
  } catch (err) {
    if (err instanceof ScrappaUnavailableError) throw err;
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
        headers: scrappaHeaders(apiKey),
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
    if (res.status === 503 || res.status === 502) {
      throw new ScrappaUnavailableError(res.status, lastReason);
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
        headers: scrappaHeaders(apiKey),
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
