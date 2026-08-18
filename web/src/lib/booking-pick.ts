import {
  aviasalesAffiliateUrl,
  kiwiAffiliateUrl,
  kiwiSearchUrl,
  tripcomAffiliateUrl,
} from "@/lib/deal-display";

export type BookingPickInput = {
  origin: string;
  dest: string;
  outDate: string;
  retDate: string;
  subId?: string;
};

type AviaRow = {
  price?: number;
  departure_at?: string;
  return_at?: string;
};

type AviaLookup =
  | { kind: "fare"; origin: string }
  | { kind: "empty" }
  | { kind: "unknown" };

const cache = new Map<string, { at: number; url: string }>();
const CACHE_MS = 10 * 60 * 1000;

function cacheKey(input: BookingPickInput) {
  return `${input.origin}|${input.dest}|${input.outDate}|${input.retDate}`;
}

function istanbulPair(origin: string): string[] {
  const o = origin.toUpperCase();
  if (o === "IST" || o === "SAW") return ["IST", "SAW"];
  return [o];
}

function sameDay(iso: string | undefined, ymd: string) {
  return typeof iso === "string" && iso.slice(0, 10) === ymd;
}

async function aviasalesFetch(
  origin: string,
  dest: string,
  departureAt: string,
  returnAt: string,
): Promise<{ ok: boolean; rows: AviaRow[] }> {
  const token = process.env.TRAVELPAYOUTS_TOKEN?.trim();
  if (!token) return { ok: false, rows: [] };
  const params = new URLSearchParams({
    origin: origin.toUpperCase(),
    destination: dest.toUpperCase(),
    departure_at: departureAt,
    return_at: returnAt,
    one_way: "false",
    sorting: "price",
    currency: "usd",
    limit: "30",
    unique: "false",
    token,
  });
  try {
    const res = await fetch(
      `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" },
    );
    if (!res.ok) return { ok: false, rows: [] };
    const body = (await res.json()) as { success?: boolean; data?: AviaRow[] };
    if (!body.success || !Array.isArray(body.data)) return { ok: false, rows: [] };
    return { ok: true, rows: body.data };
  } catch {
    return { ok: false, rows: [] };
  }
}

function cheapestOnDates(
  rows: AviaRow[],
  outDate: string,
  retDate: string,
): number | null {
  const prices = rows
    .filter(
      (row) =>
        sameDay(row.departure_at, outDate) &&
        sameDay(row.return_at, retDate) &&
        typeof row.price === "number" &&
        row.price > 0,
    )
    .map((row) => row.price as number);
  return prices.length ? Math.min(...prices) : null;
}

/** IST+SAW ayrı. Kesin tarih yoksa o ay envanteri var mı bakılır (Şam yok, Paris var). */
async function aviasalesLookup(
  origin: string,
  dest: string,
  outDate: string,
  retDate: string,
): Promise<AviaLookup> {
  const origins = istanbulPair(origin);
  const exact = await Promise.all(
    origins.map(async (code) => {
      const fetched = await aviasalesFetch(code, dest, outDate, retDate);
      return {
        code,
        fetched,
        price: fetched.ok ? cheapestOnDates(fetched.rows, outDate, retDate) : null,
      };
    }),
  );

  const cardFare = exact.find(
    (q) => q.code === origin.toUpperCase() && q.price != null,
  );
  if (cardFare) return { kind: "fare", origin: cardFare.code };
  const otherFare = exact.find((q) => q.price != null);
  if (otherFare) return { kind: "fare", origin: otherFare.code };

  if (exact.some((q) => !q.fetched.ok)) return { kind: "unknown" };

  const monthOut = outDate.slice(0, 7);
  const monthRet = retDate.slice(0, 7);
  const months = await Promise.all(
    origins.map((code) => aviasalesFetch(code, dest, monthOut, monthRet)),
  );
  if (months.some((m) => !m.ok)) return { kind: "unknown" };
  if (months.some((m) => m.rows.length > 0)) {
    return { kind: "fare", origin: origin.toUpperCase() };
  }
  return { kind: "empty" };
}

function aviasalesUrl(input: BookingPickInput, origin = input.origin) {
  return aviasalesAffiliateUrl(
    origin,
    input.dest,
    input.outDate,
    input.retDate,
    input.subId,
  );
}

function fallbackUrl(input: BookingPickInput) {
  return (
    tripcomAffiliateUrl(
      input.origin,
      input.dest,
      input.outDate,
      input.retDate,
      input.subId,
    ) ??
    kiwiAffiliateUrl(
      input.origin,
      input.dest,
      input.outDate,
      input.retDate,
      input.subId,
    ) ??
    kiwiSearchUrl(input.origin, input.dest, input.outDate, input.retDate)
  );
}

/**
 * Çalışan Aviasales kartları aynı kalır.
 * Trip.com / Kiwi yalnız rotada o ay Aviasales envanteri yoksa (Şam).
 */
export async function pickBookingUrl(
  input: BookingPickInput,
): Promise<string | undefined> {
  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.url;

  const lookup = await aviasalesLookup(
    input.origin,
    input.dest,
    input.outDate,
    input.retDate,
  );
  const url =
    lookup.kind === "empty"
      ? fallbackUrl(input)
      : (lookup.kind === "fare"
          ? aviasalesUrl(input, lookup.origin)
          : aviasalesUrl(input)) ?? fallbackUrl(input);

  if (url) cache.set(key, { at: Date.now(), url });
  return url;
}
