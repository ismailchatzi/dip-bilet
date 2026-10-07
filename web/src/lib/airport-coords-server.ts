import airports from "@/lib/airports.json";
import { airportCoord, type AirportCoord } from "@/lib/airport-coords";
import { dealDestCode } from "@/lib/deal-display";
import type { Deal } from "@/lib/types";

/** OurAirports (tarifeli sefer, IATA). Büyük liste istemci paketine girmesin; yalnız API'den import et. */
const ALL = airports as Record<string, number[]>;

export function destCoordsForDeals(deals: Deal[]): Record<string, AirportCoord> {
  const out: Record<string, AirportCoord> = {};
  for (const deal of deals) {
    const code = dealDestCode(deal);
    if (!code || out[code]) continue;
    const row = ALL[code];
    const pos =
      airportCoord(code) ?? (row?.length === 2 ? { lat: row[0]!, lng: row[1]! } : null);
    if (pos) out[code] = pos;
  }
  return out;
}
