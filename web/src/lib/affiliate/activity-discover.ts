import { gunzipSync } from "node:zlib";
import { englishNamesForActivityDiscovery } from "@/lib/affiliate/activity-city-names";

const TIQETS_ORIGIN = "https://www.tiqets.com";
const TIQETS_CITY_SITEMAP = "https://www.tiqets.com/sitemap/site-map-city-en.xml.gz";
const TIQETS_PRODUCT_SITEMAP = "https://www.tiqets.com/sitemap/site-map-product-en.xml.gz";

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/** Ürün sitemap ~1400 şehir; city sitemap yalnızca ~200 */
const CITY_PATH_RE =
  /\/en\/((?:things-to-do-in-[a-z0-9-]+|[a-z0-9-]+-attractions)-c\d+)\//g;

export type TiqetsCityConfig = {
  path: string;
  themePaths: [string, string, string, string];
  cityId: number | null;
};

/** Teaser kart sırası: müze → tur → skip-line → deneyim */
const THEME_SLUG_PRIORITIES: string[][] = [
  ["museums-t2968", "attractions-t2966"],
  ["city-tours-t1040", "guided-tours", "hop-on-hop-off"],
  ["historical-archaeological-sites-t2967"],
  [
    "trips-excursions-t1042",
    "cruises-boat-tours-t1035",
    "day-trips",
    "nature-wildlife",
    "food-drinks-t1034",
    "shows-theatres",
  ],
];

let sitemapIndex: Map<string, string> | null = null;
let sitemapLoadedAt = 0;
const SITEMAP_TTL_MS = 24 * 3600 * 1000;

const cityConfigCache = new Map<string, { at: number; config: TiqetsCityConfig | null }>();
const CITY_CONFIG_TTL_MS = 12 * 3600 * 1000;

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Tiqets şehir slug eşlemesi — yalnız kesin / tire sınırlı eşleşme.
 * "mus" → "paramus" gibi includes eşleşmeleri yasak.
 */
function citySlugMatches(indexKey: string, citySlug: string) {
  if (!citySlug || citySlug.length < 3) return false;
  if (indexKey === citySlug) return true;
  // "new-york" ↔ "new-york-city"
  if (indexKey.startsWith(`${citySlug}-`) || citySlug.startsWith(`${indexKey}-`)) {
    return Math.min(indexKey.length, citySlug.length) >= 4;
  }
  return false;
}

function pathSlugKey(path: string) {
  const base = path.replace(/\/$/, "");
  if (base.startsWith("things-to-do-in-")) {
    const m = base.match(/^things-to-do-in-(.+)-c\d+$/);
    return m?.[1] ?? base;
  }
  const m = base.match(/^(.+?)(?:-attractions)?-c\d+$/);
  return m?.[1] ?? base;
}

function lookupTiqetsPath(
  index: Map<string, string>,
  ...names: (string | undefined)[]
): string | null {
  for (const name of names) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    // IATA kodu (MSR) şehir sayfası değildir
    if (/^[A-Z]{3}$/i.test(trimmed)) continue;
    const slug = slugify(trimmed);
    if (!slug || slug.length < 3) continue;

    const exact = index.get(slug);
    if (exact) return exact;

    for (const [key, path] of index) {
      if (citySlugMatches(key, slug)) return path;
    }
  }
  return null;
}

function tiqetsCityIdFromPath(path: string): number | null {
  const m = path.match(/-c(\d+)/);
  return m ? Number(m[1]) : null;
}

function cityPathFromSitemap(raw: string) {
  return raw.trim().replace(/\/$/, "");
}

function isCityListingPath(path: string) {
  return (
    /-c\d+/.test(path) &&
    (path.includes("-attractions-") || path.startsWith("things-to-do-in-"))
  );
}

function indexCityPathsFromXml(xml: string, index: Map<string, string>) {
  for (const m of xml.matchAll(CITY_PATH_RE)) {
    const path = cityPathFromSitemap(m[1] ?? "");
    const key = pathSlugKey(path);
    if (key) index.set(key, path);
  }

  for (const m of xml.matchAll(/<loc>https:\/\/www\.tiqets\.com\/en\/([^<]+?)<\//g)) {
    const path = cityPathFromSitemap(m[1] ?? "");
    if (!isCityListingPath(path)) continue;
    const key = pathSlugKey(path);
    if (key) index.set(key, path);
  }
}

async function fetchGzSitemap(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return gunzipSync(buf).toString("utf8");
}

async function loadTiqetsSitemapIndex(): Promise<Map<string, string>> {
  const now = Date.now();
  if (sitemapIndex && now - sitemapLoadedAt < SITEMAP_TTL_MS) {
    return sitemapIndex;
  }

  const index = new Map<string, string>();
  const [cityXml, productXml] = await Promise.all([
    fetchGzSitemap(TIQETS_CITY_SITEMAP),
    fetchGzSitemap(TIQETS_PRODUCT_SITEMAP),
  ]);

  if (cityXml) indexCityPathsFromXml(cityXml, index);
  if (productXml) indexCityPathsFromXml(productXml, index);

  if (index.size === 0) {
    throw new Error("tiqets sitemap empty");
  }

  sitemapIndex = index;
  sitemapLoadedAt = now;
  return index;
}

function extractCategorySlugs(html: string, cityPath: string) {
  const escaped = cityPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}/([a-z0-9-]+-t\\d+)`, "gi");
  const found = new Set<string>();
  for (const m of html.matchAll(re)) {
    found.add(`${cityPath}/${(m[1] ?? "").toLowerCase()}`);
  }
  return [...found];
}

function slugMatchesCategory(slug: string, priority: string) {
  const stem = priority.replace(/-t\d+$/, "");
  return slug === priority || slug.startsWith(stem);
}

function pickThemePaths(
  cityPath: string,
  categories: string[],
): [string, string, string, string] {
  const used = new Set<string>();

  const pick = (priorities: string[]) => {
    for (const p of priorities) {
      const hit = categories.find((c) => {
        if (used.has(c)) return false;
        const slug = c.split("/").pop() ?? c;
        return slugMatchesCategory(slug, p);
      });
      if (hit) {
        used.add(hit);
        return hit;
      }
    }
    const any = categories.find((c) => !used.has(c));
    if (any) {
      used.add(any);
      return any;
    }
    return cityPath;
  };

  return [
    pick(THEME_SLUG_PRIORITIES[0]!),
    pick(THEME_SLUG_PRIORITIES[1]!),
    pick(THEME_SLUG_PRIORITIES[2]!),
    pick(THEME_SLUG_PRIORITIES[3]!),
  ];
}

function pathBelongsToCity(path: string, names: string[]) {
  const key = pathSlugKey(path);
  if (!key) return false;
  for (const name of names) {
    const trimmed = name?.trim();
    if (!trimmed || /^[A-Z]{3}$/i.test(trimmed)) continue;
    const slug = slugify(trimmed);
    if (slug.length >= 3 && citySlugMatches(key, slug)) return true;
  }
  return false;
}

function fallbackConfig(path: string): TiqetsCityConfig {
  return {
    path,
    themePaths: [path, path, path, path],
    cityId: tiqetsCityIdFromPath(path),
  };
}

/** Tiqets sitemap (city + product) + şehir sayfasından otomatik city/theme path */
export async function discoverTiqetsCity(
  iata: string,
  cityLabel?: string,
  destinationLabel?: string,
): Promise<TiqetsCityConfig | null> {
  const code = iata.trim().toUpperCase();
  const cacheKey = `v4|${code}|${cityLabel?.trim() ?? ""}|${destinationLabel?.trim() ?? ""}`;
  const cached = cityConfigCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CITY_CONFIG_TTL_MS) {
    return cached.config;
  }

  try {
    const index = await loadTiqetsSitemapIndex();
    const names = await englishNamesForActivityDiscovery(code, cityLabel, destinationLabel);
    const path = lookupTiqetsPath(index, ...names);
    if (!path || !pathBelongsToCity(path, names)) {
      cityConfigCache.set(cacheKey, { at: Date.now(), config: null });
      return null;
    }

    const pageUrl = `${TIQETS_ORIGIN}/en/${path}/`;
    const res = await fetch(pageUrl, {
      headers: FETCH_HEADERS,
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      cityConfigCache.set(cacheKey, { at: Date.now(), config: null });
      return null;
    }

    const html = await res.text();
    const categories = extractCategorySlugs(html, path);
    const config: TiqetsCityConfig =
      categories.length >= 2
        ? {
            path,
            themePaths: pickThemePaths(path, categories),
            cityId: tiqetsCityIdFromPath(path),
          }
        : fallbackConfig(path);

    cityConfigCache.set(cacheKey, { at: Date.now(), config });
    return config;
  } catch {
    cityConfigCache.set(cacheKey, { at: Date.now(), config: null });
    return null;
  }
}
