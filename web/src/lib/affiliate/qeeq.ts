import { bookingCityQuery } from "@/lib/affiliate/booking-hotels";
import type { CarRentalCard, CarRentalResult } from "@/lib/affiliate/car-rental-types";
import { effectiveCarRentalDates } from "@/lib/affiliate/car-rental-dates";

const QEEQ_ORIGIN = "https://www.qeeq.com";
/** Travelpayouts QEEQ — promo 4845 */
const TP_PROMO_ID = "4845";
const TP_CLICK = process.env.QEEQ_TP_CLICK?.trim() || "";

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Qeeq-Terminal-Type": "desktop",
};

type QeeqListItem = {
  car_info?: {
    car_group_id?: number;
    type_name?: string;
    car_name?: string;
    image?: string;
  };
  group_price_info?: {
    best_price_info?: QeeqPriceInfo;
    diamond_price_info?: QeeqPriceInfo;
  };
  meal_list?: Array<{
    meal_price_info?: {
      best_price_info?: QeeqPriceInfo;
      diamond_price_info?: QeeqPriceInfo;
    };
  }>;
};

type QeeqPriceInfo = {
  currency_symbol?: string;
  per_day_price?: string;
  price?: string;
};

type QeeqListData = {
  summary_info?: { total_cars?: number; rental_days?: number };
  list?: QeeqListItem[];
};

type ParsedOffer = {
  id: string;
  name: string;
  typeName: string;
  imageUrl: string;
  totalUsd: number;
  displayPrice: string;
};

function qeeqStartId() {
  return `p${Math.floor(Math.random() * 89999 + 10000)}${Math.floor(Date.parse(new Date().toDateString()) / 1000)}`;
}

function absImage(url: string) {
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function parseUsd(raw?: string) {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : null;
}

/**
 * Vitrin fiyatı = herkese açık “best price” (toplam).
 * Diamond / üye fiyatı kullanılmaz — ekranda gerçekçi olmayan indirimler çıkmasın.
 */
function publicTotalUsd(item: QeeqListItem) {
  const candidates: number[] = [];
  const push = (info?: QeeqPriceInfo) => {
    const n = parseUsd(info?.price);
    if (n != null && n > 0) candidates.push(n);
  };
  push(item.group_price_info?.best_price_info);
  for (const meal of item.meal_list ?? []) {
    push(meal.meal_price_info?.best_price_info);
  }
  return candidates.length ? Math.min(...candidates) : null;
}

function formatTotalPrice(totalUsd: number, rentalDays: number, sym = "US$") {
  if (rentalDays > 1) return `${sym}${totalUsd} toplam · ${rentalDays} gün`;
  return `${sym}${totalUsd} toplam`;
}

function parseOffer(item: QeeqListItem, rentalDays: number): ParsedOffer | null {
  const info = item.car_info;
  if (!info?.car_name?.trim() || !info.image) return null;
  const totalUsd = publicTotalUsd(item);
  if (totalUsd == null) return null;
  const sym =
    item.group_price_info?.best_price_info?.currency_symbol?.trim() ||
    item.meal_list?.[0]?.meal_price_info?.best_price_info?.currency_symbol?.trim() ||
    "US$";
  const name = info.car_name.trim();
  return {
    id: `${name}-${info.type_name ?? "car"}`.toLowerCase().replace(/\s+/g, "-"),
    name,
    typeName: info.type_name?.trim() || "",
    imageUrl: absImage(info.image),
    totalUsd,
    displayPrice: formatTotalPrice(totalUsd, rentalDays, sym),
  };
}

/** Aynı modelden tek kart — en ucuz toplam fiyat; QEEQ sıralamasına yakın. */
function pickShowcaseOffers(list: QeeqListItem[], rentalDays: number, limit: number) {
  const byName = new Map<string, ParsedOffer>();
  for (const item of list) {
    const offer = parseOffer(item, rentalDays);
    if (!offer) continue;
    const prev = byName.get(offer.name);
    if (!prev || offer.totalUsd < prev.totalUsd) byName.set(offer.name, offer);
  }
  return [...byName.values()].sort((a, b) => a.totalUsd - b.totalUsd).slice(0, limit);
}

export function qeeqSearchUrl(iata: string, pickupDate: string, dropoffDate: string) {
  const code = iata.trim().toUpperCase();
  const params = new URLSearchParams({
    pickup_iata: code,
    dropoff_iata: code,
    from_date_0: pickupDate,
    from_date_1: "10:00",
    to_date_0: dropoffDate,
    to_date_1: "10:00",
    driver_age: "30-60",
    citizen_country_code: "US",
  });
  return `${QEEQ_ORIGIN}/car/search?${params.toString()}`;
}

/** Travelpayouts QEEQ — promo 4845 (tp.media veya cXX click domain). */
export function qeeqAffiliateUrl(deepUrl: string, subId?: string) {
  if (process.env.NEXT_PUBLIC_QEEQ_DIRECT_LINKS === "1") {
    return deepUrl;
  }
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim();
  if (!marker) return deepUrl;
  const shmarker = subId ? `${marker}.${subId}` : marker;
  if (TP_CLICK) {
    const params = new URLSearchParams({
      shmarker,
      promo_id: TP_PROMO_ID,
      source_type: "customlink",
      type: "click",
      custom_url: deepUrl,
    });
    return `${TP_CLICK}?${params.toString()}`;
  }
  const params = new URLSearchParams({
    marker: shmarker,
    p: TP_PROMO_ID,
    u: deepUrl,
  });
  return `https://tp.media/r?${params.toString()}`;
}

function searchParams(iata: string, pickupDate: string, dropoffDate: string) {
  const code = iata.trim().toUpperCase();
  return {
    pickup_iata: code,
    dropoff_iata: code,
    from_date_0: pickupDate,
    from_date_1: "10:00",
    to_date_0: dropoffDate,
    to_date_1: "10:00",
    driver_age: "30-60",
    citizen_country_code: "US",
  };
}

async function fetchQeeqClid(base: Record<string, string>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${QEEQ_ORIGIN}/car-api/search/getClid?${new URLSearchParams({ ...base, start: qeeqStartId() })}`,
      { headers: FETCH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) continue;
    const json = (await res.json()) as { code?: string; data?: { clid?: string } };
    const clid = json.data?.clid;
    if (clid && clid !== "0") return clid;
  }
  return null;
}

async function fetchQeeqList(base: Record<string, string>, clid: string, limit: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(
      `${QEEQ_ORIGIN}/car-api/search/list?${new URLSearchParams({
        ...base,
        clid,
        sort: "1",
        size: String(limit),
        page: "1",
      })}`,
      { headers: FETCH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) continue;
    const json = (await res.json()) as { code?: string; data?: QeeqListData };
    if (String(json.code) !== "0") continue;
    return json.data ?? null;
  }
  return null;
}

function buildCards(
  offers: ParsedOffer[],
  location: string,
  searchUrl: string,
): CarRentalCard[] {
  return offers.map((offer) => ({
    id: offer.id,
    name: offer.name,
    imageUrl: offer.imageUrl,
    category: offer.typeName ? `${offer.typeName} · ${location}` : location,
    priceFormatted: offer.displayPrice,
    bookUrl: searchUrl,
  }));
}

function qeeqResultShell(
  code: string,
  location: string,
  effective: { pickup: string; dropoff: string; adjusted: boolean },
) {
  const deepSearch = qeeqSearchUrl(code, effective.pickup, effective.dropoff);
  const searchUrl = qeeqAffiliateUrl(deepSearch, `qeeq-${code.toLowerCase()}`);
  return { deepSearch, searchUrl, location, effective };
}

/** Liste API düşerse bile QEEQ arama linki (EconomyBookings yedeği yok). */
export function fetchQeeqSearchFallback(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): CarRentalResult {
  const code = iata.trim().toUpperCase();
  const effective = effectiveCarRentalDates(pickupDate, dropoffDate);
  const location = bookingCityQuery(code, cityLabel) || cityLabel || code;
  const { searchUrl } = qeeqResultShell(code, location, effective);
  return {
    location,
    cards: [
      {
        id: `qeeq-search-${code.toLowerCase()}`,
        name: `${location} araç kiralama`,
        imageUrl:
          "https://imgcdn1.qeeq.com/aligz-ccrc/public/vehicle/std/57/57233fc0ab11270796e33e0f05d1d47b.png?imageView2/2/w/240/q/150/format/jpg",
        category: "QEEQ · canlı arama",
        priceFormatted: "Fiyatları gör",
        bookUrl: searchUrl,
      },
    ],
    searchUrl,
    pickupDate: effective.pickup,
    dropoffDate: effective.dropoff,
    datesAdjusted: effective.adjusted,
    provider: "qeeq",
    livePrices: false,
  };
}

/** QEEQ canlı arama — car-api/list */
export async function fetchQeeqCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  const code = iata.trim().toUpperCase();
  const effective = effectiveCarRentalDates(pickupDate, dropoffDate);
  const location = bookingCityQuery(code, cityLabel) || cityLabel || code;
  const base = searchParams(code, effective.pickup, effective.dropoff);

  const clid = await fetchQeeqClid(base);
  if (!clid) return null;

  const data = await fetchQeeqList(base, clid, 40);
  const total = data?.summary_info?.total_cars ?? 0;
  const list = data?.list ?? [];
  const rentalDays = data?.summary_info?.rental_days ?? 1;
  if (total <= 0 || list.length === 0) return null;

  const { searchUrl } = qeeqResultShell(code, location, effective);
  const offers = pickShowcaseOffers(list, rentalDays, 4);
  const cards = buildCards(offers, location, searchUrl);
  if (cards.length === 0) return null;

  return {
    location,
    cards,
    searchUrl,
    pickupDate: effective.pickup,
    dropoffDate: effective.dropoff,
    rentalDays,
    datesAdjusted: effective.adjusted,
    provider: "qeeq",
    livePrices: true,
  };
}

export { QEEQ_ORIGIN };
