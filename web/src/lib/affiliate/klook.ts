import type { ActivityOfferCard, ActivityOfferResult } from "@/lib/affiliate/activities-types";
import { probeKlookPage, probeKlookThemeUrls } from "@/lib/affiliate/klook-theme-preview";
import { destPhotoUrls } from "@/lib/destination-photos";

const KLOOK_ORIGIN = "https://www.klook.com";
const TP_CLICK = "https://c87.travelpayouts.com/click";
const TP_PROMO_ID = "2075";

/**
 * Tiqets yoksa Klook yedek — yalnız şehir/liste deep link’leri.
 * Tekil “Currently unavailable” aktivite URL’leri yok (Saraybosna vakası).
 */
const KLOOK_CITY: Record<
  string,
  { cityUrl: string; themeUrls: [string, string, string, string] }
> = {
  // SJJ çıkarıldı: sabit aktivite linklerinin hepsi unavailable
  TIA: {
    cityUrl: `${KLOOK_ORIGIN}/city/443-tirana-municipally-things-to-do/`,
    themeUrls: [
      `${KLOOK_ORIGIN}/experiences/list/tirana-municipally-tours/c443-cate9/`,
      `${KLOOK_ORIGIN}/experiences/list/tirana-municipally-attraction-tickets/c443-cate8/`,
      `${KLOOK_ORIGIN}/experiences/list/tirana-municipally-day-trips/c443-cate10/`,
      `${KLOOK_ORIGIN}/city/443-tirana-municipally-things-to-do/`,
    ],
  },
  BEG: {
    cityUrl: `${KLOOK_ORIGIN}/city/belgrade-things-to-do/`,
    themeUrls: [
      `${KLOOK_ORIGIN}/city/belgrade-things-to-do/`,
      `${KLOOK_ORIGIN}/city/belgrade-things-to-do/`,
      `${KLOOK_ORIGIN}/city/belgrade-things-to-do/`,
      `${KLOOK_ORIGIN}/city/belgrade-things-to-do/`,
    ],
  },
  SKP: {
    cityUrl: `${KLOOK_ORIGIN}/city/444-skopje-things-to-do/`,
    themeUrls: [
      `${KLOOK_ORIGIN}/city/444-skopje-things-to-do/`,
      `${KLOOK_ORIGIN}/city/444-skopje-things-to-do/`,
      `${KLOOK_ORIGIN}/city/444-skopje-things-to-do/`,
      `${KLOOK_ORIGIN}/city/444-skopje-things-to-do/`,
    ],
  },
  TBS: {
    cityUrl: `${KLOOK_ORIGIN}/city/453-tbilisi-things-to-do/`,
    themeUrls: [
      `${KLOOK_ORIGIN}/experiences/list/tbilisi-attraction-tickets/c453-cate8/`,
      `${KLOOK_ORIGIN}/experiences/list/tbilisi-tours/c453-cate9/`,
      `${KLOOK_ORIGIN}/experiences/list/tbilisi-day-trips/c453-cate10/`,
      `${KLOOK_ORIGIN}/city/453-tbilisi-things-to-do/`,
    ],
  },
  GYD: {
    cityUrl: `${KLOOK_ORIGIN}/city/342-baku-things-to-do/`,
    themeUrls: [
      `${KLOOK_ORIGIN}/en-US/experiences/list/baku-tours-experiences/c342/`,
      `${KLOOK_ORIGIN}/city/342-baku-things-to-do/`,
      `${KLOOK_ORIGIN}/city/342-baku-things-to-do/`,
      `${KLOOK_ORIGIN}/city/342-baku-things-to-do/`,
    ],
  },
  MLE: {
    cityUrl: `${KLOOK_ORIGIN}/city/527-male-things-to-do/`,
    themeUrls: [
      `${KLOOK_ORIGIN}/en-US/experiences/list/male-tours-experiences/c527/`,
      `${KLOOK_ORIGIN}/city/527-male-things-to-do/`,
      `${KLOOK_ORIGIN}/city/527-male-things-to-do/`,
      `${KLOOK_ORIGIN}/city/527-male-things-to-do/`,
    ],
  },
};

const TEASER_THEMES = [
  { suffix: "Müze & galeri", category: "Kültür", subId: "klook-museums" },
  { suffix: "Şehir turu", category: "Rehberli gezi", subId: "klook-tours" },
  { suffix: "Skip-the-line bilet", category: "Popüler", subId: "klook-skip" },
  { suffix: "Deneyim & aktivite", category: "Deneyim", subId: "klook-exp" },
] as const;

/** Klook vitrini — yalnız Tiqets’in kapsamadığı vitrin şehirleri */
export function klookCitySupported(iata: string) {
  return Boolean(KLOOK_CITY[iata.trim().toUpperCase()]);
}

export function klookCityUrl(iata: string) {
  const code = iata.trim().toUpperCase();
  return KLOOK_CITY[code]?.cityUrl ?? `${KLOOK_ORIGIN}/en-US/`;
}

/** Travelpayouts Klook — promo 2075 */
export function klookAffiliateUrl(deepUrl: string, subId?: string) {
  if (process.env.NEXT_PUBLIC_KLOOK_DIRECT_LINKS === "1") {
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

async function buildTeaserCards(iata: string, cityLabel: string): Promise<ActivityOfferCard[]> {
  const code = iata.trim().toUpperCase();
  const cfg = KLOOK_CITY[code];
  if (!cfg) return [];

  const probes = await probeKlookThemeUrls(cfg.themeUrls);
  const photos = destPhotoUrls(code);
  const cards: ActivityOfferCard[] = [];
  const usedUrls = new Set<string>();

  for (let idx = 0; idx < TEASER_THEMES.length; idx++) {
    const theme = TEASER_THEMES[idx]!;
    const url = cfg.themeUrls[idx]!;
    const probe = probes[idx];
    // Ölü / unavailable / doğrulanamayan → kart yok (dest foto ile maskeleme yok)
    if (!probe?.bookable) continue;
    if (usedUrls.has(url)) continue;
    usedUrls.add(url);

    const imageUrl = probe.imageUrl ?? photos[idx] ?? photos[0];
    if (!imageUrl) continue;

    cards.push({
      id: `klook-teaser-${code}-${idx}`,
      name: `${cityLabel} — ${theme.suffix}`,
      imageUrl,
      category: theme.category,
      priceFormatted: "Aktiviteleri gör",
      bookUrl: klookAffiliateUrl(url, theme.subId),
      livePrice: false,
    });
  }

  return cards;
}

export async function fetchKlookActivityOfferCards(
  iata: string,
  cityLabel: string,
): Promise<ActivityOfferResult | null> {
  const code = iata.trim().toUpperCase();
  if (!klookCitySupported(code)) return null;

  const cfg = KLOOK_CITY[code]!;
  const cityProbe = await probeKlookPage(cfg.cityUrl);
  const cards = await buildTeaserCards(code, cityLabel);

  // Ne kart ne şehir sayfası doğrulanırsa vitrin yok
  if (cards.length === 0 && !cityProbe.bookable) return null;
  if (cards.length === 0) return null;

  return {
    cards,
    searchUrl: klookAffiliateUrl(cfg.cityUrl, "klook"),
    livePrices: false,
    provider: "klook",
  };
}
