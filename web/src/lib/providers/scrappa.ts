import type { ScannedFare } from "@/lib/scan/dates";

type FlightsInput = {
  destinationCode: string;
  destinationName: string;
  outbound: string;
  returnDate: string;
};

/** Scrappa round-trip Google Flights */
export async function scrappaCityFare(
  input: FlightsInput,
): Promise<ScannedFare | null> {
  const apiKey = process.env.SCRAPPA_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPPA_API_KEY eksik");

  const params = new URLSearchParams({
    origin: "IST",
    destination: input.destinationCode,
    departure_date: input.outbound,
    return_date: input.returnDate,
    currency: "TRY",
    hl: "tr",
    gl: "tr",
  });

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
  if (!res.ok) throw new Error(`Scrappa HTTP ${res.status}`);
  const json = (await res.json()) as {
    flights?: Array<{
      price?: number;
      currency?: string;
      legs?: Array<{ airline?: string; stops?: number }>;
    }>;
    error?: string;
    message?: string;
  };

  if (json.error || json.message?.toLowerCase().includes("error")) {
    throw new Error(json.error || json.message || "Scrappa hata");
  }

  const priced = (json.flights ?? [])
    .filter((f) => typeof f.price === "number" && f.price! > 0)
    .sort((a, b) => a.price! - b.price!);
  const best = priced[0];
  if (!best || typeof best.price !== "number") return null;

  return {
    provider: "scrappa",
    destinationCode: input.destinationCode,
    destinationName: input.destinationName,
    price: best.price,
    currency: best.currency || "TRY",
    outboundDate: input.outbound,
    returnDate: input.returnDate,
    airline: best.legs?.[0]?.airline,
    stops: best.legs?.[0]?.stops,
  };
}
