const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export type KlookPageProbe = {
  imageUrl: string | null;
  /** false = Currently unavailable / 404 / engel — vitrine koyma */
  bookable: boolean;
};

const probeCache = new Map<string, { at: number; probe: KlookPageProbe }>();
const PROBE_TTL_MS = 6 * 3600 * 1000;

function parseOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m?.[1]?.trim() ?? null;
}

function isKlookDeadPage(html: string, status: number) {
  if (status >= 400) return true;
  return /currently unavailable|not available for booking|activity is unavailable|page not found|404\s*[-–]|this activity is no longer/i.test(
    html,
  );
}

/**
 * Klook sayfası canlı mı?
 * Cloudflare engellerse bookable=false (ölü varsay — dest foto ile maskeleme yok).
 */
export async function probeKlookPage(pageUrl: string): Promise<KlookPageProbe> {
  const cached = probeCache.get(pageUrl);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return cached.probe;
  }

  const dead: KlookPageProbe = { imageUrl: null, bookable: false };
  try {
    const res = await fetch(pageUrl, {
      headers: FETCH_HEADERS,
      next: { revalidate: 21600 },
    });
    if (!res.ok) {
      probeCache.set(pageUrl, { at: Date.now(), probe: dead });
      return dead;
    }
    const html = await res.text();
    if (isKlookDeadPage(html, res.status)) {
      probeCache.set(pageUrl, { at: Date.now(), probe: dead });
      return dead;
    }
    const imageUrl = parseOgImage(html);
    // Liste/şehir sayfalarında og:image olmayabilir — HTML geldiyse ve unavailable yoksa OK
    const probe: KlookPageProbe = {
      imageUrl,
      bookable: true,
    };
    probeCache.set(pageUrl, { at: Date.now(), probe });
    return probe;
  } catch {
    probeCache.set(pageUrl, { at: Date.now(), probe: dead });
    return dead;
  }
}

/** @deprecated probeKlookPage kullan */
export async function fetchKlookPageImage(pageUrl: string): Promise<string | null> {
  const p = await probeKlookPage(pageUrl);
  return p.bookable ? p.imageUrl : null;
}

export async function fetchKlookThemeImages(
  themeUrls: readonly string[],
): Promise<(string | null)[]> {
  const probes = await Promise.all(themeUrls.map((u) => probeKlookPage(u)));
  return probes.map((p) => (p.bookable ? p.imageUrl : null));
}

export async function probeKlookThemeUrls(
  themeUrls: readonly string[],
): Promise<KlookPageProbe[]> {
  return Promise.all(themeUrls.map((u) => probeKlookPage(u)));
}
