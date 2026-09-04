import { bookingCityQuery } from "@/lib/affiliate/booking-hotels";
import type { CarRentalCard, CarRentalResult } from "@/lib/affiliate/car-rental-types";
import { effectiveCarRentalDates } from "@/lib/affiliate/car-rental-dates";

const EB_ORIGIN = "https://www.economybookings.com";
/** Travelpayouts EconomyBookings — promo 2018, click c10 */
const TP_CLICK = process.env.ECONOMYBOOKINGS_TP_CLICK?.trim() || "https://c10.travelpayouts.com/click";
const TP_PROMO_ID = process.env.ECONOMYBOOKINGS_TP_PROMO_ID?.trim() || "2018";

const TEASER_CATEGORIES = [
  {
    id: "economy",
    name: "Ekonomi sınıf",
    category: "Hertz · Sixt · Enterprise",
    image:
      "https://imgcdn1.qeeq.com/aligz-ccrc/public/vehicle/std/57/57233fc0ab11270796e33e0f05d1d47b.png?imageView2/2/w/240/q/150/format/jpg",
  },
  {
    id: "compact",
    name: "Kompakt",
    category: "Volkswagen Golf veya benzeri",
    image:
      "https://imgcdn1.qeeq.com/aligz-ccrc/public/vehicle/std/6b/6b06180c2fae911d17108d4211655d9b.png?imageView2/2/w/240/q/150/format/jpg",
  },
  {
    id: "suv",
    name: "SUV",
    category: "Ford Explorer veya benzeri",
    image:
      "https://imgcdn1.qeeq.com/aligz-ccrc/public/vehicle/std/c2/c255f181daf28a749cb542db6dd6ac5f.jpg?imageView2/2/w/240/q/150/format/jpg",
  },
  {
    id: "van",
    name: "Minivan",
    category: "7+ koltuk · aile",
    image:
      "https://imgcdn1.qeeq.com/aligz-ccrc/public/vehicle/std/29/29b67dde85fd894b3c3d21105cb01bcf.png?imageView2/2/w/240/q/150/format/jpg",
  },
] as const;

export function economyBookingsSearchUrl(
  iata: string,
  pickupDate: string,
  dropoffDate: string,
) {
  const code = iata.trim().toUpperCase();
  const params = new URLSearchParams({
    pickup: code,
    dropoff: code,
    pickupDate,
    dropoffDate,
    pickupTime: "10:00",
    dropoffTime: "10:00",
  });
  return `${EB_ORIGIN}/en/cars/results?${params.toString()}`;
}

export function economyBookingsAffiliateUrl(deepUrl: string, subId?: string) {
  if (process.env.NEXT_PUBLIC_ECONOMYBOOKINGS_DIRECT_LINKS === "1") {
    return deepUrl;
  }
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim();
  if (!marker) return deepUrl;
  const shmarker = subId ? `${marker}.${subId}` : marker;
  const params = new URLSearchParams({
    shmarker,
    promo_id: TP_PROMO_ID,
    source_type: "customlink",
    type: "click",
    custom_url: deepUrl,
  });
  return `${TP_CLICK}?${params.toString()}`;
}

function buildTeaserCards(location: string, searchUrl: string): CarRentalCard[] {
  return TEASER_CATEGORIES.map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.image,
    category: `${item.category} · ${location}`,
    priceFormatted: "Teklif al",
    bookUrl: searchUrl,
  }));
}

/** EconomyBookings yedek vitrin — QEEQ’te envanter yoksa */
export async function fetchEconomyBookingsCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  const code = iata.trim().toUpperCase();
  const effective = effectiveCarRentalDates(pickupDate, dropoffDate);
  const location = bookingCityQuery(code, cityLabel) || cityLabel || code;
  const deepSearch = economyBookingsSearchUrl(code, effective.pickup, effective.dropoff);
  const searchUrl = economyBookingsAffiliateUrl(deepSearch, `eb-${code.toLowerCase()}`);
  const cards = buildTeaserCards(location, searchUrl);
  if (cards.length === 0) return null;

  return {
    location,
    cards,
    searchUrl,
    pickupDate: effective.pickup,
    dropoffDate: effective.dropoff,
    datesAdjusted: effective.adjusted,
    provider: "economybookings",
    livePrices: false,
  };
}

export { EB_ORIGIN };
