import { bookingCityQuery } from "@/lib/affiliate/booking-hotels";

/**
 * Doğrulanmış Trip.com cityId haritası.
 * Her ID, list sayfası başlığında beklenen şehir adıyla eşleşecek şekilde kontrol edildi.
 * Doğrulanamayan şehir → otel vitrini gösterilmez (yanlış şehre asla gitme).
 */
export const TRIPCOM_CITY_ID: Record<string, number> = {
  ATH: 710,
  BUD: 637,
  VIE: 651,
  PRG: 1288,
  FCO: 343,
  VCE: 688,
  MUC: 363,
  BER: 193,
  TBS: 7612,
  GYD: 650,
  SJJ: 10260,
  BEG: 10257,
  TIA: 36649,
  SKP: 7617,
  SSH: 36242,
  CDG: 192,
  MAD: 357,
  BCN: 40795,
  DPS: 723,
  HKT: 725,
  MLE: 1207,
  CPH: 260,
  BTS: 4008,
  MSR: 5332,
  LHR: 338,
  LTN: 338,
  STN: 338,
  AMS: 176,
  DXB: 220,
  SHJ: 220,
  DOH: 1401,
  WAW: 293,
  LIS: 1231,
  MXP: 361,
  NCE: 775,
  ARN: 420,
  OSL: 827,
  HEL: 277,
  DUB: 803,
  BRU: 196,
  ZRH: 434,
  VLC: 1351,
  ACC: 1274,
  /** Ordu-Giresun havalimanı */
  OGU: 20002,
  MED: 19744,
  JED: 801,
  BAH: 194,
  OTP: 674,
  CAI: 332,
  CTA: 1419,
  UFA: 3902,
  VAN: 1750,
  ALG: 1271,
};

/** Başlık doğrulaması için İngilizce / yerel adlar */
const CITY_TITLE_ALIASES: Record<string, string[]> = {
  ATH: ["athens"],
  BUD: ["budapest"],
  VIE: ["vienna"],
  PRG: ["prague"],
  FCO: ["rome"],
  VCE: ["venice"],
  MUC: ["munich"],
  BER: ["berlin"],
  TBS: ["tbilisi"],
  GYD: ["baku"],
  SJJ: ["sarajevo"],
  BEG: ["belgrade"],
  TIA: ["tirana"],
  SKP: ["skopje"],
  SSH: ["sharm"],
  CDG: ["paris"],
  MAD: ["madrid"],
  BCN: ["barcelona"],
  DPS: ["bali"],
  HKT: ["phuket"],
  MLE: ["male", "maldives", "malé"],
  CPH: ["copenhagen"],
  BTS: ["bratislava"],
  MSR: ["mus"],
  LHR: ["london"],
  LTN: ["london"],
  STN: ["london"],
  AMS: ["amsterdam"],
  DXB: ["dubai"],
  SHJ: ["dubai", "sharjah"],
  DOH: ["doha"],
  WAW: ["warsaw"],
  LIS: ["lisbon"],
  MXP: ["milan"],
  NCE: ["nice"],
  ARN: ["stockholm"],
  OSL: ["oslo"],
  HEL: ["helsinki"],
  DUB: ["dublin"],
  BRU: ["brussels"],
  ZRH: ["zurich"],
  VLC: ["valencia"],
  ACC: ["accra"],
  OGU: ["ordu", "giresun"],
  MED: ["medina", "madinah"],
  JED: ["jeddah"],
  BAH: ["bahrain", "manama"],
  OTP: ["bucharest"],
  CAI: ["cairo"],
  CTA: ["catania"],
  UFA: ["ufa"],
  VAN: ["van"],
  ALG: ["algiers"],
};

const FETCH_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const verifiedCache = new Map<string, number | null>();

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function slugifyCity(name: string) {
  return norm(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Kelime sınırlı eşleşme — "mus" ⊂ "paramus" yok. */
export function titleMatchesCity(title: string, aliases: string[]) {
  const t = norm(title);
  if (!t || /404/.test(t)) return false;
  if (/where to stay in\s+\|/i.test(title)) return false;
  return aliases.some((alias) => {
    const n = norm(alias).trim();
    if (n.length < 3) return false;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(t);
  });
}

function aliasesFor(iata: string, cityLabel?: string): string[] {
  const code = iata.trim().toUpperCase();
  const out: string[] = [...(CITY_TITLE_ALIASES[code] ?? [])];
  const en = bookingCityQuery(code, cityLabel);
  if (en && !/^[A-Z]{3}$/i.test(en)) out.push(en);
  if (cityLabel?.trim()) out.push(cityLabel.trim());
  // tekilleştir
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = norm(a);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchListTitle(cityId: number): Promise<string> {
  const url = `https://www.trip.com/hotels/list?city=${cityId}&checkIn=2026-10-15&checkOut=2026-10-19&adult=2&crn=1&curr=USD&locale=en-XX`;
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(18000),
  });
  if (!res.ok) return "";
  const html = await res.text();
  return (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").trim();
}

/** cityId gerçekten bu şehre mi ait? */
export async function verifyTripcomCityId(
  cityId: number,
  aliases: string[],
): Promise<boolean> {
  if (!cityId || aliases.length === 0) return false;
  try {
    const title = await fetchListTitle(cityId);
    return titleMatchesCity(title, aliases);
  } catch {
    return false;
  }
}

async function discoverViaSerpApi(
  aliases: string[],
): Promise<number | null> {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) return null;

  for (const name of aliases) {
    if (name.length < 3 || /^[A-Z]{3}$/i.test(name)) continue;
    const slug = slugifyCity(name);
    const q = encodeURIComponent(
      `site:us.trip.com/hotels "${name}" hotels-list${slug ? ` OR ${slug}-hotels-list` : ""}`,
    );
    try {
      const res = await fetch(
        `https://serpapi.com/search.json?engine=google&q=${q}&num=8&api_key=${key}`,
        { next: { revalidate: 86400 } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        organic_results?: Array<{ link?: string }>;
      };
      for (const row of json.organic_results ?? []) {
        const m = row.link?.match(/hotels-list-(\d+)/i);
        if (!m) continue;
        const id = Number(m[1]);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (await verifyTripcomCityId(id, aliases)) return id;
      }
    } catch {
      /* sonraki alias */
    }
  }
  return null;
}

/**
 * Trip.com cityId çöz.
 * Doğrulanmış haritadaki ID’ler doğrudan kullanılır.
 * Bilinmeyen şehir: SerpAPI adayları sayfa başlığıyla doğrulanır; olmazsa null
 * (otel vitrini gizlenir — yanlış şehre asla yönlendirme).
 */
export async function resolveTripcomCityId(
  iata: string,
  cityLabel?: string,
): Promise<number | null> {
  const code = iata.trim().toUpperCase();
  const aliases = aliasesFor(code, cityLabel);
  const cacheKey = `${code}|${aliases.map(norm).join(",")}`;
  if (verifiedCache.has(cacheKey)) return verifiedCache.get(cacheKey)!;

  const mapped = TRIPCOM_CITY_ID[code];
  if (mapped) {
    verifiedCache.set(cacheKey, mapped);
    return mapped;
  }

  if (aliases.length === 0) {
    verifiedCache.set(cacheKey, null);
    return null;
  }

  const discovered = await discoverViaSerpApi(aliases);
  verifiedCache.set(cacheKey, discovered);
  return discovered;
}
