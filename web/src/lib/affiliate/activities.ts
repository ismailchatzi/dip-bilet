import type { ActivityOfferResult } from "@/lib/affiliate/activities-types";
import { destPhotoCode } from "@/lib/destination-photos";
import { fetchKlookActivityOfferCards } from "@/lib/affiliate/klook";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import { tripExtrasSupported } from "@/lib/affiliate/trip-extras";
import { fetchActivityOfferCards as fetchTiqetsActivityOfferCards } from "@/lib/affiliate/tiqets";

export type {
  ActivityOfferCard,
  ActivityOfferResult,
  ActivityProvider,
} from "@/lib/affiliate/activities-types";

function pushCandidate(out: string[], code: string | null | undefined) {
  if (!code) return;
  const u = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(u)) return;
  if (!out.includes(u)) out.push(u);
  const tracked = findTrackedDestination(u);
  if (tracked && tracked.code !== u && !out.includes(tracked.code)) {
    out.push(tracked.code);
  }
}

/**
 * Google Deals bazen ORY/BVA vb. döner; otel/araç/aktivite vitrini kanonik şehir kodu ister.
 * Ekstra havalimanında (ORY→CDG, BGY→MXP) tracked şehir kodu önce gelir.
 */
export function resolveActivityDestIata(
  iata: string,
  cityLabel?: string,
  destination?: string,
): string | null {
  const raw = iata.trim().toUpperCase();
  const tracked = findTrackedDestination(raw);
  if (tracked && tripExtrasSupported(tracked.code)) return tracked.code;

  const candidates: string[] = [];
  pushCandidate(candidates, raw);
  pushCandidate(candidates, destPhotoCode(cityLabel ?? ""));
  pushCandidate(candidates, destPhotoCode(destination ?? ""));

  for (const code of candidates) {
    if (tripExtrasSupported(code)) return code;
  }
  return null;
}

/** Otel / araç API — aktivite ile aynı kanonik IATA. */
export function resolveExtrasDestIata(
  iata: string,
  cityLabel?: string,
  destination?: string,
) {
  return resolveActivityDestIata(iata, cityLabel, destination);
}

/** Tiqets (sitemap keşfi) → yoksa Klook (doğrulanmış Balkan vb.) */
export async function fetchActivityOfferCards(
  iata: string,
  cityLabel: string,
  destinationLabel?: string,
): Promise<ActivityOfferResult | null> {
  const tiqets = await fetchTiqetsActivityOfferCards(iata, cityLabel, destinationLabel);
  if (tiqets) return tiqets;
  return fetchKlookActivityOfferCards(iata, cityLabel);
}
