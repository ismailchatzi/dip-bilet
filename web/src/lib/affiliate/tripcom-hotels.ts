import { effectiveCarRentalDates } from "@/lib/affiliate/car-rental-dates";
import { bookingCityQuery } from "@/lib/affiliate/booking-hotels";
import { destPhotoUrls } from "@/lib/destination-photos";
import { resolveTripcomCityId } from "@/lib/affiliate/tripcom-city-ids";

export type HotelOfferCard = {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  priceFormatted: string;
  oldPriceFormatted?: string;
  discountPercent?: number;
  bookUrl: string;
  livePrice: boolean;
  /** Küçük vitrin notu: en uygun / yüksek puanlı */
  badge?: string;
};

type ScrapedHotel = {
  id: string;
  name: string;
  score: number | null;
  reviews: number;
  imageUrl: string | null;
  nightly: number | null;
  total: number | null;
  displayNightly: string | null;
};

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

function affiliateParams(subId?: string) {
  const params = new URLSearchParams();
  const alliance = process.env.TRIPCOM_ALLIANCE_ID?.trim();
  const sid = process.env.TRIPCOM_SID?.trim();
  const sub3 = process.env.TRIPCOM_TRIP_SUB3?.trim();
  if (alliance) params.set("Allianceid", alliance);
  if (sid) params.set("SID", sid);
  if (subId?.trim()) params.set("trip_sub1", subId.trim());
  if (sub3) params.set("trip_sub3", sub3);
  return params;
}

/** Trip.com şehir listesi — city= zorunlu (cityName oturumdaki son şehri açar). */
export function tripcomHotelSearchUrl(
  cityId: number,
  checkin: string,
  checkout: string,
  subId?: string,
) {
  const params = affiliateParams(subId);
  params.set("city", String(cityId));
  params.set("checkIn", checkin);
  params.set("checkOut", checkout);
  params.set("adult", "2");
  params.set("children", "0");
  params.set("crn", "1");
  params.set("curr", "USD");
  params.set("locale", "en-XX");
  return `https://www.trip.com/hotels/list?${params.toString()}`;
}

export function tripcomHotelDetailUrl(
  hotelId: string,
  cityId: number,
  checkin: string,
  checkout: string,
  subId?: string,
) {
  const params = affiliateParams(subId);
  params.set("hotelId", hotelId);
  params.set("cityId", String(cityId));
  params.set("checkIn", checkin);
  params.set("checkOut", checkout);
  params.set("adult", "2");
  params.set("children", "0");
  params.set("crn", "1");
  params.set("curr", "USD");
  params.set("locale", "en-XX");
  return `https://www.trip.com/hotels/detail/?${params.toString()}`;
}

function extractHotelListJson(html: string): unknown[] | null {
  const markerEsc = 'hotelList\\":[';
  const markerPlain = 'hotelList":[';
  let start = html.indexOf(markerEsc);
  let escaped = true;
  if (start >= 0) {
    start += markerEsc.length - 1; // keep '['
  } else {
    start = html.indexOf(markerPlain);
    if (start < 0) return null;
    start += markerPlain.length - 1;
    escaped = false;
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;

  let raw = html.slice(start, end);
  if (escaped) {
    raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  raw = raw.replace(/[\u0000-\u001f]+/g, " ");
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseTotalUsd(explanation?: string) {
  if (!explanation) return null;
  const m = explanation.match(/Total price:\s*US\$\s*([\d,]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function mapScrapedHotels(list: unknown[]): ScrapedHotel[] {
  const out: ScrapedHotel[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const item = row as {
      hotelInfo?: {
        summary?: { hotelId?: string; masterHotelId?: string };
        nameInfo?: { name?: string };
        commentInfo?: { commentScore?: string; commenterNumber?: string };
        hotelImages?: { url?: string };
      };
      roomInfo?: Array<{
        priceInfo?: {
          price?: number;
          displayPrice?: string;
          priceExplanation?: string;
        };
      }>;
    };
    const info = item.hotelInfo;
    const id = String(info?.summary?.hotelId || info?.summary?.masterHotelId || "");
    const name = info?.nameInfo?.name?.trim();
    if (!id || !name) continue;
    const score = Number(info?.commentInfo?.commentScore);
    const reviews =
      Number(String(info?.commentInfo?.commenterNumber || "").replace(/[^\d]/g, "")) ||
      0;
    const priceInfo = item.roomInfo?.[0]?.priceInfo;
    const nightly = Number(priceInfo?.price);
    out.push({
      id,
      name: name.replace(/&amp;/g, "&"),
      score: Number.isFinite(score) && score > 0 ? score : null,
      reviews,
      imageUrl: info?.hotelImages?.url?.trim() || null,
      nightly: Number.isFinite(nightly) && nightly > 0 ? nightly : null,
      total: parseTotalUsd(priceInfo?.priceExplanation),
      displayNightly: priceInfo?.displayPrice?.trim() || null,
    });
  }
  return out;
}

async function scrapeTripcomHotels(
  cityId: number,
  checkin: string,
  checkout: string,
): Promise<ScrapedHotel[]> {
  const url = tripcomHotelSearchUrl(cityId, checkin, checkout);
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const list = extractHotelListJson(html);
  if (!list) return [];
  return mapScrapedHotels(list);
}

function nightsBetween(checkin: string, checkout: string) {
  const a = Date.parse(`${checkin}T12:00:00Z`);
  const b = Date.parse(`${checkout}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

function formatPrice(hotel: ScrapedHotel, nights: number) {
  if (hotel.nightly != null) {
    const nightLabel = hotel.displayNightly || `US$${hotel.nightly}`;
    if (hotel.total != null && nights > 1) {
      return `${nightLabel} / gece · US$${hotel.total} toplam`;
    }
    return `${nightLabel} / gece`;
  }
  if (hotel.total != null) {
    return nights > 1 ? `US$${hotel.total} toplam · ${nights} gece` : `US$${hotel.total}`;
  }
  return "Fiyatları gör";
}

function pickShowcaseHotels(hotels: ScrapedHotel[], limit = 5): ScrapedHotel[] {
  const withImage = hotels.filter((h) => Boolean(h.imageUrl));
  if (withImage.length === 0) return [];

  const priced = withImage.filter((h) => h.nightly != null || h.total != null);
  const pool = priced.length > 0 ? priced : withImage;

  const byPrice = [...pool].sort((a, b) => {
    const pa = a.nightly ?? a.total ?? Number.POSITIVE_INFINITY;
    const pb = b.nightly ?? b.total ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });
  const cheapest = byPrice[0]!;

  const byScore = [...pool]
    .filter((h) => h.id !== cheapest.id)
    .sort((a, b) => {
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      if (sb !== sa) return sb - sa;
      return b.reviews - a.reviews;
    });

  const picked: ScrapedHotel[] = [cheapest];
  for (const h of byScore) {
    if (picked.length >= limit) break;
    picked.push(h);
  }
  if (picked.length < limit) {
    for (const h of pool) {
      if (picked.length >= limit) break;
      if (picked.some((x) => x.id === h.id)) continue;
      picked.push(h);
    }
  }
  return picked;
}

function badgeFor(hotel: ScrapedHotel, cheapestId: string) {
  if (hotel.id === cheapestId) return "Otelin en uygunlarından";
  if (hotel.score != null && hotel.score >= 8.5) return "En yüksek puanlılardan";
  if (hotel.score != null) return "Yüksek puanlı";
  return "Öne çıkan otel";
}

function buildLiveCards(
  hotels: ScrapedHotel[],
  cityId: number,
  checkin: string,
  checkout: string,
  nights: number,
): HotelOfferCard[] {
  const picked = pickShowcaseHotels(hotels, 5);
  if (picked.length === 0) return [];
  const cheapestId = picked[0]!.id;
  return picked.map((hotel) => {
    const livePrice = hotel.nightly != null || hotel.total != null;
    const scoreBit =
      hotel.score != null
        ? `★ ${hotel.score.toFixed(1)}${
            hotel.reviews > 0 ? ` (${hotel.reviews})` : ""
          }`
        : "Trip.com";
    return {
      id: `tripcom-${hotel.id}`,
      name: hotel.name,
      imageUrl: hotel.imageUrl!,
      category: scoreBit,
      priceFormatted: formatPrice(hotel, nights),
      bookUrl: tripcomHotelDetailUrl(
        hotel.id,
        cityId,
        checkin,
        checkout,
        `hotel-${hotel.id}`,
      ),
      livePrice,
      badge: badgeFor(hotel, cheapestId),
    };
  });
}

function buildTeaserCards(
  iata: string,
  cityLabel: string,
  cityId: number,
  checkin: string,
  checkout: string,
): HotelOfferCard[] {
  const photos = destPhotoUrls(iata);
  const searchUrl = tripcomHotelSearchUrl(cityId, checkin, checkout, "hotel");
  const themes = [
    { suffix: "Merkez oteller", category: "Şehir merkezi", badge: "Öne çıkan" },
    { suffix: "Yüksek puanlı", category: "Misafir favorisi", badge: "En yüksek puanlılardan" },
    { suffix: "Uygun fiyatlı", category: "İyi fiyat", badge: "Otelin en uygunlarından" },
    { suffix: "Popüler seçim", category: "Sık tercih edilen", badge: "Öne çıkan" },
    { suffix: "Konforlu konaklama", category: "Rahat seçenek", badge: "Öne çıkan" },
  ] as const;

  const cards: HotelOfferCard[] = [];
  for (let idx = 0; idx < themes.length; idx++) {
    const theme = themes[idx]!;
    const imageUrl = photos[idx % Math.max(photos.length, 1)] ?? photos[0];
    if (!imageUrl) break;
    cards.push({
      id: `tripcom-teaser-${iata}-${idx}`,
      name: `${cityLabel} — ${theme.suffix}`,
      imageUrl,
      category: theme.category,
      priceFormatted: "Fiyatları gör",
      bookUrl: searchUrl,
      livePrice: false,
      badge: theme.badge,
    });
  }
  // Foto yoksa bile en az bir arama kartı (Muş vb.)
  if (cards.length === 0) {
    cards.push({
      id: `tripcom-teaser-${iata}-0`,
      name: `${cityLabel} otelleri`,
      imageUrl:
        "https://ak-d.tripcdn.com/images/1mc2512000aerr4ydB474_R_600_600_R5_D.jpg",
      category: "Trip.com",
      priceFormatted: "Fiyatları gör",
      bookUrl: searchUrl,
      livePrice: false,
      badge: "Şehir otelleri",
    });
  }
  return cards;
}

export async function fetchHotelOfferCards(
  iata: string,
  cityLabel: string,
  checkin: string,
  checkout: string,
) {
  const code = iata.trim().toUpperCase();
  const effective = effectiveCarRentalDates(checkin, checkout);
  const label = bookingCityQuery(code, cityLabel) || cityLabel || code;
  const cityId = await resolveTripcomCityId(code, label);
  if (!cityId) return null;

  const searchUrl = tripcomHotelSearchUrl(
    cityId,
    effective.pickup,
    effective.dropoff,
    "hotel",
  );
  const nights = nightsBetween(effective.pickup, effective.dropoff);

  let cards: HotelOfferCard[] = [];
  try {
    const scraped = await scrapeTripcomHotels(
      cityId,
      effective.pickup,
      effective.dropoff,
    );
    cards = buildLiveCards(
      scraped,
      cityId,
      effective.pickup,
      effective.dropoff,
      nights,
    );
  } catch {
    cards = [];
  }

  if (cards.length === 0) {
    cards = buildTeaserCards(
      code,
      cityLabel,
      cityId,
      effective.pickup,
      effective.dropoff,
    );
  }

  return {
    cards,
    searchUrl,
    datesAdjusted: effective.adjusted,
    livePrices: cards.some((c) => c.livePrice),
    provider: "tripcom" as const,
    cityId,
  };
}
