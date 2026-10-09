import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_DISPLAY_FACTOR,
  canonicalDestCode,
  dealDestCode,
  displayDealPrice,
  foldOneCardPerCity,
  googleFlightsSearchUrl,
  isUnverifiedOneWaySum,
} from "@/lib/deal-display";
import { destPhotoUrls } from "@/lib/destination-photos";
import { notifyNewDeals } from "@/lib/notify-new-deals";
import { readScanBoard, patchScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import { passesDealThresholdGate } from "@/lib/scan/dip-gate";
import {
  hardFloorUsd,
  manualStandardUsd,
  strikeFromThreshold,
} from "@/lib/scan/showcase-config";
import {
  findTrackedDestination,
  trackedDestinationLabel,
} from "@/lib/scan/scrappa-targets";
import type { Deal, DealsPayload } from "@/lib/types";

/**
 * Vitrin fiyatı ekranda %3 düşük gösterilir. Dış kaynak kartı kaynağın tam fiyatıyla
 * görünsün diye ham fiyat, ekranda tam fiyata düşecek en küçük değer olarak saklanır.
 */
export function rawPriceForDisplay(fullUsd: number): number {
  let raw = Math.floor(fullUsd / BOOKING_DISPLAY_FACTOR);
  while (displayDealPrice(raw) < fullUsd) raw += 1;
  return raw;
}

export type ExternalCardInput = {
  /** Uçulan varış havalimanı (PVG, BGY…) */
  airport: string;
  origin: "IST" | "SAW";
  outboundDate: string;
  returnDate: string;
  /** Kaynağın tam fiyatı, USD — kartta aynen görünür */
  fullUsd: number;
  airline?: string;
  stops?: number;
  selfTransfer?: boolean;
  /** Takip listesinde olmayan şehirde katalogdan / kaynaktan gelen ad */
  cityName?: string;
};

export type ExternalCardSkip =
  | "esik_yok"
  | "isim_yok"
  | "gorsel_yok"
  | "esik_ustu";

/** Elle eşikli şehirler — Google Deals kataloğunda henüz görülmemiş olabilirler. */
const MANUAL_CITY_NAMES: Record<string, string> = {
  AUH: "Abu Dabi", AKX: "Aktöbe", KSY: "Kars", ALC: "Alicante", AER: "Soçi",
  AGP: "Malaga", BIO: "Bilbao", AMM: "Amman", BRE: "Bremen", CIT: "Şımkent",
  JED: "Cidde", BHX: "Birmingham", BLQ: "Bologna", NCE: "Nice", DMM: "Dammam",
  PMO: "Palermo", VLC: "Valensiya", ALA: "Almatı", EDI: "Edinburgh", BSL: "Basel",
  MLH: "Basel", CAI: "Kahire", OVB: "Novosibirsk", VAN: "Van", MSR: "Muş",
  DUB: "Dublin", BRS: "Bristol", GZT: "Gaziantep", BJV: "Bodrum", KYA: "Konya",
  BRI: "Bari", PVG: "Şanghay", SHA: "Şanghay", BAH: "Bahreyn", BJL: "Banjul",
  CTA: "Katanya", BGW: "Bağdat", KCM: "Kahramanmaraş", BRU: "Brüksel", CRL: "Brüksel",
  CMN: "Kazablanka", AJI: "Ağrı", SVX: "Yekaterinburg", LIS: "Lizbon", SVQ: "Sevilla",
  NAP: "Napoli", MNL: "Manila",
};

function cityNameFor(
  city: string,
  board: DealsPayload | null,
  fallback?: string,
): string | null {
  const tracked = findTrackedDestination(city);
  if (tracked) return tracked.name;
  const seen = board?.seenDestinations?.find((s) => s.code === city)?.name?.trim();
  if (seen && seen !== city) return seen;
  return MANUAL_CITY_NAMES[city] ?? (fallback?.trim() || null);
}

/** Aynı şehrin diğer havalimanı — görsel ondan alınabilir. */
const PHOTO_SIBLING: Record<string, string> = {
  MLH: "BSL",
  BSL: "MLH",
  CRL: "BRU",
  BRU: "CRL",
  SHA: "PVG",
  PVG: "SHA",
};

function photoFor(city: string, board: DealsPayload | null): string | undefined {
  const pool = [
    ...(board?.deals ?? []),
    ...(board?.archive ?? []),
    ...(board?.cityLows ?? []),
  ];
  const codes = [city, PHOTO_SIBLING[city]].filter(Boolean);
  return pool.find((d) => codes.includes(dealDestCode(d)) && d.photoUrl)?.photoUrl;
}

function seededPick<T>(list: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length]!;
}

/** Şehrin canlı kartı varsa eşik / üstü çizili / görsel ondan; yoksa elle eşik + standart. */
export function buildExternalCard(
  input: ExternalCardInput,
  board: DealsPayload | null,
): { ok: true; card: Deal } | { ok: false; reason: ExternalCardSkip } {
  const airport = input.airport.trim().toUpperCase();
  const city = canonicalDestCode(airport);
  const template = (board?.deals ?? []).find((d) => dealDestCode(d) === city);

  const name = cityNameFor(city, board, input.cityName);
  if (!name) return { ok: false, reason: "isim_yok" };

  const threshold = template?.thresholdPrice ?? hardFloorUsd(city);
  if (threshold == null || threshold <= 0) return { ok: false, reason: "esik_yok" };
  const standard = manualStandardUsd(city);
  const strike =
    template?.averagePrice ??
    (standard != null && standard > threshold
      ? Math.round(standard)
      : strikeFromThreshold(threshold, threshold));

  const id = `external:${city}:${input.origin}:${input.outboundDate}:${input.origin}:${input.returnDate}`;
  const local = destPhotoUrls(city).length > 0 ? destPhotoUrls(city) : destPhotoUrls(name);
  const remote = local.filter((u) => /^https?:\/\//.test(u));
  const photoUrl =
    template?.photoUrl ||
    (remote.length > 0
      ? seededPick(remote, id)
      : local.length > 0
        ? undefined
        : photoFor(city, board));
  if (local.length === 0 && !photoUrl) return { ok: false, reason: "gorsel_yok" };

  const tracked = findTrackedDestination(city);
  const destAirport = airport !== city ? airport : undefined;
  const price = rawPriceForDisplay(input.fullUsd);
  const now = new Date().toISOString();
  const card: Deal = {
    id,
    destination:
      tracked && destAirport
        ? trackedDestinationLabel(tracked, destAirport)
        : `${name} (${city})`,
    destAirport,
    price,
    averagePrice: strike,
    thresholdPrice: threshold,
    discountPercent: strike > 0 ? Math.max(0, Math.round(((strike - price) / strike) * 100)) : 0,
    currency: "USD",
    outboundDate: input.outboundDate,
    returnDate: input.returnDate,
    airline: input.airline,
    stops: input.stops,
    selfTransfer: input.selfTransfer,
    photoUrl,
    googleFlightsUrl: googleFlightsSearchUrl(
      input.origin,
      airport,
      input.outboundDate,
      input.origin,
      input.returnDate,
    ),
    departureLabel: `İstanbul (${input.origin})`,
    foundAt: now,
    verifiedAt: now,
    lastCheckedAt: now,
    dealBadge: "MUTLAK_FIRSAT",
  };
  if (!passesDealThresholdGate(card)) return { ok: false, reason: "esik_ustu" };
  return { ok: true, card };
}

/**
 * Şehir kartıyla birleştir: E daha ucuzsa kahraman olur, değilse diğer tarihlere iner.
 * Kahraman / tazelik kuralı okumada aynı (promoteFreshHeroDeal).
 */
export async function publishExternalCard(
  admin: SupabaseClient,
  card: Deal,
): Promise<{ ok: boolean; hero: boolean; error?: string }> {
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const city = dealDestCode(card);
  const sameCity = previous.filter((d) => dealDestCode(d) === city);
  const rest = previous.filter((d) => dealDestCode(d) !== city);
  const merged = foldOneCardPerCity([...sameCity, card]);
  const hero = merged.some((d) => d.id === card.id);

  const deals = [...rest.filter((d) => !isUnverifiedOneWaySum(d)), ...merged];
  const { payload, live, previousLive } = foldShowcase(board.deals, deals);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, hero, error: saved.error ?? "Kayıt başarısız" };
  await notifyNewDeals(admin, previousLive, live);
  return { ok: true, hero };
}
