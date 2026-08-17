import {
  aviasalesAffiliateUrl,
  kiwiAffiliateUrl,
  tripcomAffiliateUrl,
} from "@/lib/deal-display";

export type BookingPickInput = {
  origin: string;
  dest: string;
  outDate: string;
  retDate: string;
  subId?: string;
};

type Partner = "kiwi" | "aviasales" | "tripcom";
type Quote = { partner: "kiwi" | "aviasales"; price: number };

const cache = new Map<string, { at: number; url: string }>();
const CACHE_MS = 10 * 60 * 1000;

function cacheKey(input: BookingPickInput) {
  return `${input.origin}|${input.dest}|${input.outDate}|${input.retDate}`;
}

function kiwiDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function jsonGet(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function aviasalesQuote(
  origin: string,
  dest: string,
  outDate: string,
  retDate: string,
): Promise<Quote | null> {
  const token = process.env.TRAVELPAYOUTS_TOKEN?.trim();
  if (!token) return null;
  const params = new URLSearchParams({
    origin: origin.toUpperCase(),
    destination: dest.toUpperCase(),
    departure_at: outDate,
    return_at: retDate,
    one_way: "false",
    sorting: "price",
    currency: "usd",
    limit: "30",
    unique: "false",
    token,
  });
  const body = await jsonGet(
    `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`,
  );
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  const rows = Array.isArray(data) ? data : [];
  let best: number | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { price?: unknown; departure_at?: unknown };
    const price = num(r.price);
    if (price == null) continue;
    const dep = String(r.departure_at ?? "");
    if (dep && !dep.startsWith(outDate)) continue;
    if (best == null || price < best) best = price;
  }
  return best == null ? null : { partner: "aviasales", price: best };
}

async function kiwiQuote(
  origin: string,
  dest: string,
  outDate: string,
  retDate: string,
): Promise<Quote | null> {
  const key = process.env.KIWI_API_KEY?.trim();
  if (!key) return null;
  const params = new URLSearchParams({
    fly_from: origin.toUpperCase(),
    fly_to: dest.toUpperCase(),
    date_from: kiwiDate(outDate),
    date_to: kiwiDate(outDate),
    return_from: kiwiDate(retDate),
    return_to: kiwiDate(retDate),
    curr: "USD",
    limit: "1",
    sort: "price",
    max_stopovers: "2",
  });
  const body = await jsonGet(
    `https://api.tequila.kiwi.com/v2/search?${params}`,
    { apikey: key },
  );
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : null;
  if (!first || typeof first !== "object") return null;
  const price = num((first as { price?: unknown }).price);
  return price == null ? null : { partner: "kiwi", price };
}

function affiliateUrl(partner: Partner, input: BookingPickInput) {
  const fn =
    partner === "kiwi"
      ? kiwiAffiliateUrl
      : partner === "aviasales"
        ? aviasalesAffiliateUrl
        : tripcomAffiliateUrl;
  return fn(input.origin, input.dest, input.outDate, input.retDate, input.subId);
}

/** Fiyatı bilinenlerin ucuzu. İkisi de yoksa Trip.com, o da yoksa Aviasales. */
export async function pickBookingUrl(input: BookingPickInput): Promise<string | undefined> {
  const kiwiUrl = affiliateUrl("kiwi", input);
  const aviaUrl = affiliateUrl("aviasales", input);
  const tripUrl = affiliateUrl("tripcom", input);
  if (!kiwiUrl && !aviaUrl && !tripUrl) return undefined;

  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.url;

  const [avia, kiwi] = await Promise.all([
    aviasalesQuote(input.origin, input.dest, input.outDate, input.retDate),
    kiwiQuote(input.origin, input.dest, input.outDate, input.retDate),
  ]);

  let url: string | undefined;
  if (avia && kiwi) {
    url = (kiwi.price < avia.price ? kiwiUrl : aviaUrl) ?? kiwiUrl ?? aviaUrl;
  } else if (avia) {
    url = aviaUrl ?? kiwiUrl;
  } else if (kiwi) {
    url = kiwiUrl ?? aviaUrl;
  } else {
    url = tripUrl ?? aviaUrl ?? kiwiUrl;
  }

  if (url) cache.set(key, { at: Date.now(), url });
  return url;
}
