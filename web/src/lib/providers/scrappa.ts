type ScrappaFlight = {
  price?: number;
  currency?: string;
  airline_name?: string;
  stops?: number;
  total_duration_minutes?: number;
  legs?: Array<{ airline?: string; stops?: number }>;
};

function pickCheapest(flights: ScrappaFlight[]) {
  const priced = flights
    .filter((f) => typeof f.price === "number" && f.price! > 0)
    .sort((a, b) => a.price! - b.price!);
  return priced[0] ?? null;
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
};

/** Tek yön en ucuz — sort_by=cheapest. Sayı USD (TRY etiketi yalan). */
export async function scrappaOneWay(input: {
  origin: string;
  destination: string;
  date: string;
}): Promise<ScrappaOneWay | null> {
  const apiKey = process.env.SCRAPPA_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPPA_API_KEY eksik");

  const params = new URLSearchParams({
    origin: input.origin,
    destination: input.destination,
    departure_date: input.date,
    currency: "USD",
    hl: "tr",
    gl: "tr",
    sort_by: "cheapest",
  });

  let lastStatus = 0;
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
    if (res.status === 429 || res.status === 503) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Scrappa one-way HTTP ${res.status}`);
    const json = (await res.json()) as {
      flights?: ScrappaFlight[];
      error?: string;
      message?: string;
    };
    if (json.error || json.message?.toLowerCase().includes("error")) {
      throw new Error(json.error || json.message || "Scrappa one-way hata");
    }
    const best = pickCheapest(json.flights ?? []);
    if (!best || typeof best.price !== "number") return null;
    return {
      origin: input.origin,
      destination: input.destination,
      date: input.date,
      price: best.price,
      currency: "USD",
      airline: best.airline_name || best.legs?.[0]?.airline,
      stops: best.stops ?? best.legs?.[0]?.stops,
      durationMin: best.total_duration_minutes,
    };
  }
  throw new Error(`Scrappa one-way retry bitti HTTP ${lastStatus}`);
}
