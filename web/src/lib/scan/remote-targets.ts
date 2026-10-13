/**
 * Uzak şehir hattı (A, near + rematch bittikten sonra) — 14 Eki 2026'dan itibaren
 * gün aşırı: 1. grup, 2. grup, 1. grup… Yalnız IST, full ufuk (22–180 gün), tek yön
 * gidiş + dönüş; şehir bitince o şehrin RT + booking doğrulaması.
 * Full dilim listesine (SCRAPPA_DESTINATIONS) ve Google Deals taramasına girmez.
 */
import type { ScrappaDestination } from "@/lib/scan/scrappa-targets";
import { nightsBetween } from "@/lib/scan/trip-rules";

export const REMOTE_START_DAY = "2026-10-14";

export const REMOTE_GROUPS: Record<1 | 2, ScrappaDestination[]> = {
  1: [
    { code: "JFK", name: "New York", extraAirports: [{ code: "EWR", origins: ["IST"] }] },
    { code: "LAX", name: "Los Angeles" },
    { code: "MIA", name: "Miami" },
    { code: "GRU", name: "São Paulo" },
    { code: "SYD", name: "Sidney" },
  ],
  2: [
    { code: "HND", name: "Tokyo", extraAirports: [{ code: "NRT", origins: ["IST"] }] },
    { code: "ICN", name: "Seul" },
    { code: "KUL", name: "Kuala Lumpur" },
    { code: "SIN", name: "Singapur" },
    { code: "HKG", name: "Hong Kong" },
  ],
};

export const REMOTE_DESTINATIONS: ScrappaDestination[] = [
  ...REMOTE_GROUPS[1],
  ...REMOTE_GROUPS[2],
];

export function remoteGroupForDay(day: string): 1 | 2 | null {
  const n = nightsBetween(REMOTE_START_DAY, day);
  if (n < 0) return null;
  return n % 2 === 0 ? 1 : 2;
}

export function remoteAirports(dest: ScrappaDestination): string[] {
  return [dest.code, ...(dest.extraAirports ?? []).map((a) => a.code)];
}
