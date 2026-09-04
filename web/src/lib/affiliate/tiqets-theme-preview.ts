const TIQETS_ORIGIN = "https://www.tiqets.com";

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export type TiqetsProductPreview = {
  imageUrl: string;
  name: string;
  bookUrl: string;
  priceFormatted?: string;
  category?: string;
};

const pageCache = new Map<string, { at: number; products: TiqetsProductPreview[] }>();
const PREVIEW_TTL_MS = 24 * 3600 * 1000;

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function cardImageUrl(raw: string) {
  const url = raw.replace(/\\u0026/g, "&");
  if (!url.includes("imgix.net")) return url;
  const u = new URL(url);
  u.searchParams.set("w", "640");
  u.searchParams.set("q", "80");
  return u.toString();
}

function productFromLdItem(item: Record<string, unknown>): TiqetsProductPreview | null {
  const type = item["@type"];
  if (type !== "Product" && type !== "Event") return null;

  const name = typeof item.name === "string" ? item.name.trim() : "";
  const bookUrl = typeof item.url === "string" ? item.url.trim() : "";
  if (!name || !bookUrl) return null;

  const imageRaw = item.image;
  const image =
    typeof imageRaw === "string"
      ? imageRaw
      : Array.isArray(imageRaw) && typeof imageRaw[0] === "string"
        ? imageRaw[0]
        : null;
  if (!image) return null;

  const offers = item.offers as { price?: string | number; priceCurrency?: string } | undefined;
  let priceFormatted: string | undefined;
  if (offers?.price != null && offers.priceCurrency) {
    const amount = Number(offers.price);
    if (Number.isFinite(amount) && amount > 0) {
      priceFormatted = formatMoney(amount, offers.priceCurrency);
    }
  }

  let category = "Aktivite";
  const rating = item.aggregateRating as
    | { ratingValue?: number | string; reviewCount?: number }
    | undefined;
  if (rating?.ratingValue != null && Number(rating.ratingValue) > 0) {
    const count =
      typeof rating.reviewCount === "number" && rating.reviewCount > 0
        ? ` (${rating.reviewCount})`
        : "";
    category = `★ ${Number(rating.ratingValue).toFixed(1)}${count}`;
  }

  return {
    imageUrl: cardImageUrl(image),
    name,
    bookUrl,
    priceFormatted,
    category,
  };
}

/** Tiqets sayfa JSON-LD → benzersiz ürün listesi (sıralı) */
export function parseTiqetsProductsFromHtml(html: string): TiqetsProductPreview[] {
  const out: TiqetsProductPreview[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const json = JSON.parse(m[1] ?? "") as {
        "@graph"?: Array<Record<string, unknown>>;
        "@type"?: string;
        itemListElement?: Array<{ item?: Record<string, unknown> }>;
      };
      const nodes = json["@graph"] ?? [json];
      for (const node of nodes) {
        if (node["@type"] !== "ItemList") continue;
        const elements = node.itemListElement as Array<{ item?: Record<string, unknown> }> | undefined;
        for (const el of elements ?? []) {
          if (!el.item) continue;
          const product = productFromLdItem(el.item);
          if (!product) continue;
          const key = product.bookUrl || product.name;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(product);
        }
      }
    } catch {
      /* sonraki script */
    }
  }

  return out;
}

async function fetchPageProducts(pathSuffix: string): Promise<TiqetsProductPreview[]> {
  const key = pathSuffix.replace(/\/$/, "");
  const cached = pageCache.get(key);
  if (cached && Date.now() - cached.at < PREVIEW_TTL_MS) {
    return cached.products;
  }

  try {
    const url = `${TIQETS_ORIGIN}/en/${key}/`;
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      pageCache.set(key, { at: Date.now(), products: [] });
      return [];
    }
    const products = parseTiqetsProductsFromHtml(await res.text());
    pageCache.set(key, { at: Date.now(), products });
    return products;
  } catch {
    pageCache.set(key, { at: Date.now(), products: [] });
    return [];
  }
}

function mergeUnique(
  target: TiqetsProductPreview[],
  incoming: TiqetsProductPreview[],
  seen: Set<string>,
) {
  for (const p of incoming) {
    const key = p.bookUrl || p.name;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(p);
  }
}

/** Şehir + kategori sayfalarından en fazla `limit` farklı aktivite */
export async function fetchTiqetsActivityPreviews(
  cityPath: string,
  themePaths: readonly string[],
  limit = 4,
): Promise<TiqetsProductPreview[]> {
  const merged: TiqetsProductPreview[] = [];
  const seen = new Set<string>();

  mergeUnique(merged, await fetchPageProducts(cityPath), seen);
  if (merged.length >= limit) {
    return merged.slice(0, limit);
  }

  const extraPaths = [...new Set(themePaths.map((p) => p.replace(/\/$/, "")))].filter(
    (p) => p !== cityPath.replace(/\/$/, ""),
  );

  for (const path of extraPaths) {
    if (merged.length >= limit) break;
    mergeUnique(merged, await fetchPageProducts(path), seen);
  }

  return merged.slice(0, limit);
}
