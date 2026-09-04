import {
  discoverTiqetsCity,
  type TiqetsCityConfig,
} from "@/lib/affiliate/activity-discover";
import type { ActivityOfferCard, ActivityOfferResult } from "@/lib/affiliate/activities-types";
import { fetchTiqetsActivityPreviews } from "@/lib/affiliate/tiqets-theme-preview";
import { destPhotoUrls } from "@/lib/destination-photos";

const TIQETS_ORIGIN = "https://www.tiqets.com";
const TP_CLICK = "https://c89.travelpayouts.com/click";
const TP_PROMO_ID = "2074";
const TIQETS_API = "https://api.tiqets.com/v2";

/** Doğrulanmış Tiqets şehir sayfaları + kart başına ayrı deep link */
const TIQETS_CITY: Record<
  string,
  { path: string; themePaths: [string, string, string, string] }
> = {
  ATH: {
    path: "athens-attractions-c99239",
    themePaths: [
      "athens-attractions-c99239/museums-t2968",
      "athens-attractions-c99239/city-tours-t1040",
      "athens-attractions-c99239/historical-archaeological-sites-t2967",
      "athens-attractions-c99239/trips-excursions-t1042",
    ],
  },
  BUD: {
    path: "things-to-do-in-budapest-c68199",
    themePaths: [
      "things-to-do-in-budapest-c68199/museums-t2968",
      "things-to-do-in-budapest-c68199/city-tours-t1040",
      "things-to-do-in-budapest-c68199/historical-archaeological-sites-t2967",
      "things-to-do-in-budapest-c68199/cruises-boat-tours-t1035",
    ],
  },
  VIE: {
    path: "vienna-attractions-c60335",
    themePaths: [
      "vienna-attractions-c60335/museums-t2968",
      "vienna-attractions-c60335/city-tours-t1040",
      "vienna-attractions-c60335/historical-archaeological-sites-t2967",
      "vienna-attractions-c60335/trips-excursions-t1042",
    ],
  },
  PRG: {
    path: "prague-attractions-c64162",
    themePaths: [
      "prague-attractions-c64162/museums-t2968",
      "prague-attractions-c64162/city-tours-t1040",
      "prague-attractions-c64162/historical-archaeological-sites-t2967",
      "prague-attractions-c64162/trips-excursions-t1042",
    ],
  },
  FCO: {
    path: "rome-attractions-c71631",
    themePaths: [
      "rome-attractions-c71631/museums-t2968",
      "rome-attractions-c71631/city-tours-t1040",
      "rome-attractions-c71631/historical-archaeological-sites-t2967",
      "rome-attractions-c71631/trips-excursions-t1042",
    ],
  },
  VCE: {
    path: "venice-attractions-c71510",
    themePaths: [
      "venice-attractions-c71510/museums-t2968",
      "venice-attractions-c71510/city-tours-t1040",
      "venice-attractions-c71510/historical-archaeological-sites-t2967",
      "venice-attractions-c71510/cruises-boat-tours-t1035",
    ],
  },
  MUC: {
    path: "munich-attractions-c31",
    themePaths: [
      "munich-attractions-c31/museums-t2968",
      "munich-attractions-c31/city-tours-t1040",
      "munich-attractions-c31/historical-archaeological-sites-t2967",
      "munich-attractions-c31/trips-excursions-t1042",
    ],
  },
  BER: {
    path: "berlin-attractions-c65144",
    themePaths: [
      "berlin-attractions-c65144/museums-t2968",
      "berlin-attractions-c65144/city-tours-t1040",
      "berlin-attractions-c65144/historical-archaeological-sites-t2967",
      "berlin-attractions-c65144/trips-excursions-t1042",
    ],
  },
  SSH: {
    path: "sharm-el-sheikh-attractions-c263612",
    themePaths: [
      "sharm-el-sheikh-attractions-c263612/tickets-for-ras-mohammed-national-park-half-day-guided-bus-tour-from-sharm-el-sheikh-p1136438",
      "sharm-el-sheikh-attractions-c263612/tickets-for-giza-pyramids-egyptian-museum-guided-day-tour-from-sharm-el-sheikh-lunch-p1107615",
      "day-trips-from-sharm-el-sheikh-tickets-l254749",
      "ras-mohammed-national-park-tickets-l169570",
    ],
  },
  CDG: {
    path: "things-to-do-in-paris-c66746",
    themePaths: [
      "things-to-do-in-paris-c66746/museums-t2968",
      "things-to-do-in-paris-c66746/city-tours-t1040",
      "things-to-do-in-paris-c66746/historical-archaeological-sites-t2967",
      "things-to-do-in-paris-c66746/trips-excursions-t1042",
    ],
  },
  MAD: {
    path: "madrid-attractions-c66254",
    themePaths: [
      "madrid-attractions-c66254/museums-t2968",
      "madrid-attractions-c66254/city-tours-t1040",
      "madrid-attractions-c66254/historical-archaeological-sites-t2967",
      "madrid-attractions-c66254/trips-excursions-t1042",
    ],
  },
  BCN: {
    path: "barcelona-attractions-c66342",
    themePaths: [
      "barcelona-attractions-c66342/museums-t2968",
      "barcelona-attractions-c66342/city-tours-t1040",
      "barcelona-attractions-c66342/historical-archaeological-sites-t2967",
      "barcelona-attractions-c66342/trips-excursions-t1042",
    ],
  },
  DPS: {
    path: "bali-attractions-c267738",
    themePaths: [
      "bali-attractions-c267738/attractions-t2966",
      "bali-attractions-c267738/food-drinks-t1034",
      "bali-attractions-c267738/shows-theatres-t2596",
      "bali-attractions-c267738/trips-excursions-t1042",
    ],
  },
  HKT: {
    path: "phuket-attractions-c78451",
    themePaths: [
      "phuket-attractions-c78451/attractions-t2966",
      "phuket-attractions-c78451/cruises-boat-tours-t1035",
      "phuket-attractions-c78451/nature-wildlife-t2745",
      "phuket-attractions-c78451/trips-excursions-t1042",
    ],
  },
};

/** Manuel doğrulanmış override — SSH ürün URL’leri vb. */
async function resolveTiqetsCityConfig(
  iata: string,
  cityLabel: string,
  destinationLabel?: string,
): Promise<TiqetsCityConfig | null> {
  const code = iata.trim().toUpperCase();
  const manual = TIQETS_CITY[code];
  if (manual) {
    const m = manual.path.match(/-c(\d+)/);
    return {
      path: manual.path,
      themePaths: manual.themePaths,
      cityId: m ? Number(m[1]) : null,
    };
  }
  return discoverTiqetsCity(code, cityLabel, destinationLabel);
}

export type { ActivityOfferCard } from "@/lib/affiliate/activities-types";

/** Teaser kart temaları — her şehirde themePaths ile eşleşir */
const TEASER_THEMES = [
  {
    suffix: "Müze & galeri",
    category: "Kültür",
    subId: "tiqets-museums",
  },
  {
    suffix: "Şehir turu",
    category: "Rehberli gezi",
    subId: "tiqets-tours",
  },
  {
    suffix: "Skip-the-line bilet",
    category: "Popüler",
    subId: "tiqets-skip",
  },
  {
    suffix: "Deneyim & aktivite",
    category: "Deneyim",
    subId: "tiqets-exp",
  },
] as const;

function tiqetsDeepUrl(pathSuffix: string) {
  return `${TIQETS_ORIGIN}/en/${pathSuffix}/`;
}

function tiqetsThemePath(cfg: TiqetsCityConfig, themeIndex: number): string {
  return cfg.themePaths[themeIndex] ?? cfg.path;
}

type TiqetsProduct = {
  id?: number;
  title?: string;
  tagline?: string;
  product_url?: string;
  product_checkout_url?: string;
  image_url?: string;
  price?: number;
  currency?: string;
  prediscount_price?: number;
  rating?: number;
  rating_count?: number;
  promo_label?: string;
};

/** Tiqets partner parametreleri — TP redirect sonucuyla aynı format */
function tiqetsTrackedUrl(deepUrl: string, subId?: string) {
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim();
  if (!marker) return deepUrl;
  const url = new URL(deepUrl);
  url.searchParams.set("partner", "travelpayouts.com");
  url.searchParams.set("tq_campaign", subId ? `${marker}.${subId}` : marker);
  return url.toString();
}

/** Travelpayouts Tiqets — promo 2074 (canlı ürün / genel arama) */
export function tiqetsAffiliateUrl(deepUrl: string, subId?: string) {
  if (process.env.NEXT_PUBLIC_TIQETS_DIRECT_LINKS === "1") {
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

/** Teaser kartları: doğrudan Tiqets kategori URL (hover’da görünür, TP click yok) */
export function tiqetsTeaserBookUrl(deepUrl: string, subId?: string) {
  if (process.env.NEXT_PUBLIC_TIQETS_DIRECT_LINKS === "1") {
    return deepUrl;
  }
  return tiqetsTrackedUrl(deepUrl, subId);
}

function tiqetsCityUrlFromConfig(cfg: TiqetsCityConfig) {
  return `${TIQETS_ORIGIN}/en/${cfg.path}/`;
}

function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

function parseProductPrice(product: TiqetsProduct): {
  priceFormatted: string;
  oldPriceFormatted?: string;
  discountPercent?: number;
} {
  const amount = product.price;
  if (typeof amount !== "number" || !(amount > 0)) {
    return { priceFormatted: "Fiyatları gör" };
  }
  const currency = product.currency ?? "USD";
  const base = product.prediscount_price;
  if (typeof base === "number" && base > amount) {
    return {
      priceFormatted: formatMoney(amount, currency),
      oldPriceFormatted: formatMoney(base, currency),
      discountPercent: Math.round(((base - amount) / base) * 100),
    };
  }
  return { priceFormatted: formatMoney(amount, currency) };
}

async function buildTeaserCards(
  iata: string,
  cityLabel: string,
  cfg: TiqetsCityConfig,
): Promise<ActivityOfferCard[]> {
  const code = iata.trim().toUpperCase();
  const products = await fetchTiqetsActivityPreviews(cfg.path, cfg.themePaths, 4);
  const photos = destPhotoUrls(code);
  const cards: ActivityOfferCard[] = [];

  for (let idx = 0; idx < TEASER_THEMES.length; idx++) {
    const theme = TEASER_THEMES[idx]!;
    const product = products[idx];
    const pathSuffix = tiqetsThemePath(cfg, idx);
    const categoryFallbackUrl = tiqetsDeepUrl(pathSuffix);

    if (product?.imageUrl) {
      cards.push({
        id: `tiqets-teaser-${code}-${idx}`,
        name: product.name,
        imageUrl: product.imageUrl,
        category: product.category ?? theme.category,
        priceFormatted: product.priceFormatted ?? "Aktiviteleri gör",
        bookUrl: tiqetsTeaserBookUrl(product.bookUrl, theme.subId),
        livePrice: Boolean(product.priceFormatted),
      });
      continue;
    }

    // Destinasyon fotoğrafı yoksa kart ekleme — /how-*.png asla kullanılmaz
    const photo = photos[idx] ?? photos[0];
    if (!photo) continue;

    cards.push({
      id: `tiqets-teaser-${code}-${idx}`,
      name: `${cityLabel} — ${theme.suffix}`,
      imageUrl: photo,
      category: theme.category,
      priceFormatted: "Aktiviteleri gör",
      bookUrl: tiqetsTeaserBookUrl(categoryFallbackUrl, theme.subId),
      livePrice: false,
    });
  }

  return cards;
}

function mapProductToCard(
  product: TiqetsProduct,
  iata: string,
  cfg: TiqetsCityConfig,
): ActivityOfferCard | null {
  if (!product.id || !product.title) return null;

  const imageUrl = product.image_url?.trim();
  const pricing = parseProductPrice(product);
  const deepUrl =
    product.product_url?.startsWith("http") === true
      ? product.product_url
      : product.product_checkout_url?.startsWith("http") === true
        ? product.product_checkout_url
        : tiqetsCityUrlFromConfig(cfg);
  const bookUrl = tiqetsAffiliateUrl(deepUrl, "tiqets");

  let category = product.promo_label?.trim() || "Aktivite";
  if (typeof product.rating === "number" && product.rating > 0) {
    const count =
      typeof product.rating_count === "number" && product.rating_count > 0
        ? ` (${product.rating_count})`
        : "";
    category = `★ ${product.rating.toFixed(1)}${count}`;
  }

  const fallbackPhoto = destPhotoUrls(iata)[0];
  const resolvedImage = imageUrl || fallbackPhoto;
  if (!resolvedImage) return null;

  return {
    id: `tiqets-${product.id}`,
    name: product.title,
    imageUrl: resolvedImage,
    category,
    ...pricing,
    bookUrl,
    livePrice: Boolean(imageUrl && typeof product.price === "number"),
  };
}

async function fetchLiveActivityCards(
  iata: string,
  cfg: TiqetsCityConfig,
): Promise<ActivityOfferCard[] | null> {
  const token = process.env.TIQETS_API_TOKEN?.trim();
  const code = iata.trim().toUpperCase();
  const cityId = cfg.cityId;
  if (!token || !cityId) return null;

  const params = new URLSearchParams({
    city_id: String(cityId),
    lang: "en",
    currency: "USD",
    page_size: "12",
  });

  const res = await fetch(`${TIQETS_API}/products?${params}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
      "User-Agent": "DipBilet/1.0 (+https://dipbilet.com)",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    products?: TiqetsProduct[];
  };
  const products = json.products ?? [];
  const cards = products
    .map((p) => mapProductToCard(p, code, cfg))
    .filter((c): c is ActivityOfferCard => Boolean(c?.imageUrl))
    .slice(0, 10);

  return cards.length > 0 ? cards : null;
}

export async function fetchActivityOfferCards(
  iata: string,
  cityLabel: string,
  destinationLabel?: string,
): Promise<ActivityOfferResult | null> {
  const code = iata.trim().toUpperCase();
  const cfg = await resolveTiqetsCityConfig(code, cityLabel, destinationLabel);
  if (!cfg) return null;

  const searchUrl = tiqetsAffiliateUrl(tiqetsCityUrlFromConfig(cfg), "tiqets");

  const live = await fetchLiveActivityCards(code, cfg);
  const cards =
    live && live.length > 0 ? live : await buildTeaserCards(code, cityLabel, cfg);
  if (cards.length === 0) return null;

  return {
    cards,
    searchUrl,
    livePrices: Boolean(live?.length),
    provider: "tiqets",
  };
}
