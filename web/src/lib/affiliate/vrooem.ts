import type { CarRentalCard, CarRentalResult } from "@/lib/affiliate/car-rental-types";
import { effectiveCarRentalDates } from "@/lib/affiliate/car-rental-dates";

const VROOEM_ORIGIN = "https://vrooem.com";
/** Awin: Vrooem reklamveren + dipbilet yayıncı kimliği (linkte açık geçer). */
const AWIN_MID = "126167";
const AWIN_AFFID = "3041411";
/** Site fiyatı = sağlayıcı toplamı + %15 rezervasyon ön ödemesi (provider_markup_percent). */
const VROOEM_MARKUP = 1.15;

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

type VrooemLocation = {
  unified_location_id: number;
  name: string;
  city?: string | null;
  country?: string | null;
  iata?: string | null;
  latitude: number;
  longitude: number;
  location_type?: string;
};

type VrooemVehicle = {
  id?: string;
  display_name?: string;
  brand?: string;
  model?: string;
  category?: string;
  image?: string;
  total?: number;
  currency?: string;
  availability_status?: string;
};

const locationCache = new Map<string, { at: number; loc: VrooemLocation | null }>();
const LOCATION_CACHE_MS = 24 * 60 * 60 * 1000;

async function vrooemAirport(iata: string): Promise<VrooemLocation | null> {
  const code = iata.trim().toUpperCase();
  const hit = locationCache.get(code);
  if (hit && Date.now() - hit.at < LOCATION_CACHE_MS) return hit.loc;
  const res = await fetch(
    `${VROOEM_ORIGIN}/api/unified-locations?${new URLSearchParams({ search_term: code, limit: "10" })}`,
    { headers: { ...FETCH_HEADERS, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) return null;
  const list = (await res.json()) as VrooemLocation[];
  const loc =
    (Array.isArray(list) ? list : []).find(
      (l) => l.iata?.toUpperCase() === code && l.location_type === "airport",
    ) ?? null;
  locationCache.set(code, { at: Date.now(), loc });
  return loc;
}

function vrooemSearchUrl(loc: VrooemLocation, pickup: string, dropoff: string) {
  const id = String(loc.unified_location_id);
  const params = new URLSearchParams({
    where: loc.name,
    date_from: pickup,
    date_to: dropoff,
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    radius: "5000",
    city: loc.city ?? "",
    country: loc.country ?? "",
    provider: "mixed",
    unified_location_id: id,
    start_time: "10:00",
    end_time: "10:00",
    age: "35",
    rentalCode: "1",
    currency: "EUR",
    dropoff_unified_location_id: id,
    dropoff_where: loc.name,
    dropoff_latitude: String(loc.latitude),
    dropoff_longitude: String(loc.longitude),
  });
  return `${VROOEM_ORIGIN}/en/s?${params.toString()}`;
}

export function vrooemAffiliateUrl(deepUrl: string, clickRef?: string) {
  const params = new URLSearchParams({
    awinmid: AWIN_MID,
    awinaffid: AWIN_AFFID,
    ued: deepUrl,
  });
  if (clickRef) params.set("clickref", clickRef);
  return `https://www.awin1.com/cread.php?${params.toString()}`;
}

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function fetchVehicles(url: string): Promise<VrooemVehicle[]> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const m = html.match(/data-page="([^"]*)"/);
  if (!m) return [];
  try {
    const page = JSON.parse(decodeEntities(m[1]!)) as {
      props?: { vehicles?: { data?: VrooemVehicle[] } | VrooemVehicle[] };
    };
    const v = page.props?.vehicles;
    return (Array.isArray(v) ? v : (v?.data ?? [])).filter(
      (x) => !x.availability_status || x.availability_status === "available",
    );
  } catch {
    return [];
  }
}

function formatTotal(totalEur: number, rentalDays: number) {
  const n = Math.ceil(totalEur);
  return rentalDays > 1 ? `€${n} toplam · ${rentalDays} gün` : `€${n} toplam`;
}

function rentalDaysBetween(pickup: string, dropoff: string) {
  const d = Math.round((Date.parse(dropoff) - Date.parse(pickup)) / 86_400_000);
  return Math.max(1, d);
}

/** Vrooem canlı liste (QEEQ'te aracı olmayan şehirler için yedek). */
export async function fetchVrooemCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  const code = iata.trim().toUpperCase();
  const loc = await vrooemAirport(code);
  if (!loc) return null;
  const effective = effectiveCarRentalDates(pickupDate, dropoffDate);
  const deepUrl = vrooemSearchUrl(loc, effective.pickup, effective.dropoff);
  const vehicles = await fetchVehicles(deepUrl);
  const rentalDays = rentalDaysBetween(effective.pickup, effective.dropoff);

  const byName = new Map<string, { v: VrooemVehicle; total: number }>();
  for (const v of vehicles) {
    const name = (v.display_name || [v.brand, v.model].filter(Boolean).join(" ")).trim();
    const total = typeof v.total === "number" ? v.total * VROOEM_MARKUP : NaN;
    if (!name || !v.image || !Number.isFinite(total) || total <= 0) continue;
    if (v.currency && v.currency !== "EUR") continue;
    const prev = byName.get(name);
    if (!prev || total < prev.total) byName.set(name, { v, total });
  }
  const offers = [...byName.entries()]
    .sort((a, b) => a[1].total - b[1].total)
    .slice(0, 4);
  if (offers.length === 0) return null;

  const location = loc.city || cityLabel || code;
  const searchUrl = vrooemAffiliateUrl(deepUrl, `vrooem-${code.toLowerCase()}`);
  const cards: CarRentalCard[] = offers.map(([name, { v, total }]) => ({
    id: `vrooem-${name}`.toLowerCase().replace(/\s+/g, "-"),
    name,
    imageUrl: v.image!,
    category: v.category ? `${v.category} · ${location}` : location,
    priceFormatted: formatTotal(total, rentalDays),
    bookUrl: searchUrl,
  }));

  return {
    location,
    cards,
    searchUrl,
    pickupDate: effective.pickup,
    dropoffDate: effective.dropoff,
    rentalDays,
    datesAdjusted: effective.adjusted,
    provider: "vrooem",
    livePrices: true,
  };
}
