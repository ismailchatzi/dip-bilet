import { maxStopsForDest, scrappaMaxStopsParam } from "@/lib/scan/trip-rules";

type ScrappaFlight = {
  price?: number;
  currency?: string;
  airline_name?: string;
  stops?: number;
  total_duration_minutes?: number;
  self_transfer?: boolean;
  is_self_transfer?: boolean;
  separate_tickets?: boolean;
  extensions?: string[];
  legs?: Array<{
    airline?: string;
    stops?: number;
    self_transfer?: boolean;
  }>;
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
};

function trackedCity(origin: string, destination: string) {
  if (origin === "IST" || origin === "SAW") return destination;
  return origin;
}

function toFare(
  input: { origin: string; destination: string; date: string },
  best: ScrappaFlight,
): ScrappaOneWay {
  const stops = flightStops(best);
  return {
    origin: input.origin,
    destination: input.destination,
    date: input.date,
    price: best.price!,
    currency: "USD",
    airline: best.airline_name || best.legs?.[0]?.airline,
    stops: stops ?? undefined,
    durationMin: best.total_duration_minutes,
    selfTransfer: flightSelfTransfer(best) || undefined,
  };
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
