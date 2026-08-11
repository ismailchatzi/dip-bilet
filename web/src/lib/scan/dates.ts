import type { ScanProvider } from "./routes";

export type ScannedFare = {
  provider: ScanProvider;
  destinationCode: string;
  destinationName: string;
  price: number;
  currency: string;
  outboundDate: string;
  returnDate: string;
  airline?: string;
  stops?: number;
  googleFlightsUrl?: string;
  averagePrice?: number;
  discountPercent?: number;
  /** Google Flights price_insights.price_level */
  priceLevel?: "low" | "typical" | "high";
};

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Kayan pencere: ~21 gün sonrası çıkış, 7 gece */
export function slidingTripDates(now = new Date()): {
  outbound: string;
  returnDate: string;
} {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() + 21);
  // Güne göre kaydır (0–6) çeşitlilik için
  start.setUTCDate(start.getUTCDate() + (start.getUTCDay() % 7));
  const outbound = start.toISOString().slice(0, 10);
  return { outbound, returnDate: addDays(outbound, 7) };
}

export function seasonKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function routeKey(destinationCode: string): string {
  return `IST-SAW>${destinationCode.toUpperCase()}`;
}
