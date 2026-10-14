import type { ActivityOfferCard, ActivityOfferResult } from "@/lib/affiliate/activities-types";
import { probeKlookPage, probeKlookThemeUrls } from "@/lib/affiliate/klook-theme-preview";
import { destPhotoUrls } from "@/lib/destination-photos";

const KLOOK_ORIGIN = "https://www.klook.com";
const TP_CLICK = "https://c87.travelpayouts.com/click";
const TP_PROMO_ID = "2075";

type KlookTheme = "1-things-to-do" | "1001-tours" | "1002-day-trips" | "1013-water-activities" | "1005-food-tours";

const THEME_LABEL: Record<KlookTheme, { suffix: string; category: string; subId: string }> = {
  "1-things-to-do": { suffix: "Yapılacaklar", category: "Popüler", subId: "klook-all" },
  "1001-tours": { suffix: "Şehir turları", category: "Rehberli gezi", subId: "klook-tours" },
  "1002-day-trips": { suffix: "Günübirlik turlar", category: "Gezi", subId: "klook-daytrips" },
  "1013-water-activities": { suffix: "Su aktiviteleri", category: "Deneyim", subId: "klook-water" },
  "1005-food-tours": { suffix: "Yemek turları", category: "Lezzet", subId: "klook-food" },
};

/**
 * Tiqets yoksa Klook yedek — yalnız şehir/liste sayfaları (tekil aktivite linki yok).
 * Destination ID + temalar klook.com/sitemap-destination-ttd-plain_en.xml'den, 2026-10-14.
 * TIA/SKP/BEG/SJJ Klook'tan kalktı (şehir sayfası ana sayfaya yönleniyor).
 * DMM (1 aktivite) ve São Paulo (eyalet sayfası, 2 aktivite) zayıf → eklenmedi.
 */
const KLOOK_CITY: Record<string, { dest: string; themes: KlookTheme[] }> = {
  GYD: { dest: "c342-baku", themes: ["1-things-to-do", "1001-tours", "1002-day-trips", "1005-food-tours"] },
  TBS: { dest: "c453-tbilisi", themes: ["1-things-to-do", "1001-tours", "1002-day-trips", "1005-food-tours"] },
  MLE: { dest: "c527-male", themes: ["1-things-to-do", "1001-tours", "1013-water-activities"] },
  ALA: { dest: "c4642-almaty", themes: ["1-things-to-do", "1001-tours", "1002-day-trips"] },
  BSL: { dest: "c23494-basel", themes: ["1-things-to-do", "1001-tours", "1002-day-trips"] },
  MLH: { dest: "c23494-basel", themes: ["1-things-to-do", "1001-tours", "1002-day-trips"] },
  MED: { dest: "c701873-medina", themes: ["1-things-to-do", "1001-tours", "1002-day-trips"] },
  CMN: { dest: "c18433-prefecture-of-casablanca", themes: ["1-things-to-do", "1001-tours", "1002-day-trips"] },
};

function klookThemeUrl(dest: string, theme: KlookTheme) {
  return `${KLOOK_ORIGIN}/destination/${dest}/${theme}/`;
}

/** Klook vitrini — yalnız Tiqets’in kapsamadığı vitrin şehirleri */
export function klookCitySupported(iata: string) {
  return Boolean(KLOOK_CITY[iata.trim().toUpperCase()]);
}

export function klookCityUrl(iata: string) {
  const cfg = KLOOK_CITY[iata.trim().toUpperCase()];
  return cfg ? klookThemeUrl(cfg.dest, "1-things-to-do") : `${KLOOK_ORIGIN}/en-US/`;
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

  const urls = cfg.themes.map((t) => klookThemeUrl(cfg.dest, t));
  const probes = await probeKlookThemeUrls(urls);
  const photos = destPhotoUrls(code);
  const cards: ActivityOfferCard[] = [];

  cfg.themes.forEach((theme, idx) => {
    const probe = probes[idx];
    if (!probe?.bookable) return;
    const imageUrl = probe.imageUrl ?? photos[idx % Math.max(photos.length, 1)];
    if (!imageUrl) return;
    const label = THEME_LABEL[theme];
    cards.push({
      id: `klook-teaser-${code}-${theme}`,
      name: `${cityLabel} — ${label.suffix}`,
      imageUrl,
      category: label.category,
      priceFormatted: "Aktiviteleri gör",
      bookUrl: klookAffiliateUrl(urls[idx]!, label.subId),
      livePrice: false,
    });
  });

  return cards;
}

export async function fetchKlookActivityOfferCards(
  iata: string,
  cityLabel: string,
): Promise<ActivityOfferResult | null> {
  const code = iata.trim().toUpperCase();
  if (!klookCitySupported(code)) return null;

  const cityUrl = klookCityUrl(code);
  const cityProbe = await probeKlookPage(cityUrl);
  if (!cityProbe.bookable) return null;
  const cards = await buildTeaserCards(code, cityLabel);
  if (cards.length === 0) return null;

  return {
    cards,
    searchUrl: klookAffiliateUrl(cityUrl, "klook"),
    livePrices: false,
    provider: "klook",
  };
}
