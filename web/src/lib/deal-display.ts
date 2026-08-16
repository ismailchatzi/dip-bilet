import type { Deal } from "@/lib/types";
import { maxStopsForDest } from "@/lib/scan/trip-rules";

const DEST_COUNTRY: Record<string, string> = {
  ATH: "Yunanistan",
  BUD: "Macaristan",
  VIE: "Avusturya",
  PRG: "Çekya",
  FCO: "İtalya",
  VCE: "İtalya",
  MUC: "Almanya",
  BER: "Almanya",
  TBS: "Gürcistan",
  GYD: "Azerbaycan",
  SJJ: "Bosna-Hersek",
  BEG: "Sırbistan",
  TIA: "Arnavutluk",
  SKP: "Kuzey Makedonya",
  SSH: "Mısır",
  CDG: "Fransa",
  MAD: "İspanya",
  BCN: "İspanya",
  DPS: "Endonezya",
  HKT: "Tayland",
  MLE: "Maldivler",
};

export function formatDealMoney(amount: number, currency: string) {
  if (currency === "USD") {
    return `$${Math.round(amount).toLocaleString("en-US")}`;
  }
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("tr-TR")} ${currency}`;
  }
}

export function formatDealDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDealDateShort(iso?: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Fırsatın vitrine düştüğü TR günü. */
export function formatFoundDate(iso?: string) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDealDateShort(iso);
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const tr = new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return formatDealDateShort(tr);
}

export function dealFoundLabel(deal: Deal) {
  const day = formatFoundDate(deal.foundAt);
  return day ? `${day}’da yakalandı` : null;
}

function showcaseParts(deal: Deal) {
  if (deal.id.startsWith("scrappa:") || deal.id.startsWith("gdeals:")) {
    return deal.id.split(":");
  }
  return null;
}

export function dealDestCode(deal: Deal) {
  const parts = showcaseParts(deal);
  if (parts) return parts[1] ?? "";
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

export function dealOutOrigin(deal: Deal) {
  const parts = showcaseParts(deal);
  if (parts) return parts[2] ?? "IST";
  const m = deal.departureLabel.match(/\b(IST|SAW)\b/);
  return m?.[1] ?? "IST";
}

export function dealReturnAirport(deal: Deal) {
  const parts = showcaseParts(deal);
  if (parts) return parts[4] ?? parts[2] ?? "IST";
  return dealOutOrigin(deal);
}

export function dealCityName(deal: Deal) {
  return deal.destination.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
}

export function dealCityTitle(deal: Deal) {
  const city = dealCityName(deal);
  const country = DEST_COUNTRY[dealDestCode(deal)];
  return country ? `${city}, ${country}` : city;
}

export function dealDateRange(deal: Deal) {
  const a = formatDealDate(deal.outboundDate);
  const b = formatDealDate(deal.returnDate);
  if (a && b) return `${a} – ${b}`;
  return a || b || "Esnek tarihler";
}

export function dealDateRangeShort(deal: Deal) {
  const a = formatDealDateShort(deal.outboundDate);
  const b = formatDealDateShort(deal.returnDate);
  if (a && b) return `${a} – ${b}`;
  return a || b || "Esnek tarihler";
}

export function dealRouteLine(deal: Deal) {
  const dest = dealDestCode(deal);
  const out = dealOutOrigin(deal);
  const city = dealCityName(deal);
  return `İstanbul (${out}) → ${city}${dest ? ` (${dest})` : ""}`;
}

function pbVarint(n: number) {
  const out: number[] = [];
  let x = n >>> 0;
  while (x > 0x7f) {
    out.push((x & 0x7f) | 0x80);
    x >>>= 7;
  }
  out.push(x);
  return out;
}

function pbTag(field: number, wire: number) {
  return pbVarint((field << 3) | wire);
}

function pbBytes(field: number, bytes: number[]) {
  return [...pbTag(field, 2), ...pbVarint(bytes.length), ...bytes];
}

function pbString(field: number, value: string) {
  return pbBytes(field, Array.from(new TextEncoder().encode(value)));
}

function pbVarintField(field: number, value: number) {
  return [...pbTag(field, 0), ...pbVarint(value)];
}

function googleAirportBlob(code: string) {
  return [...pbVarintField(1, 1), ...pbString(2, code.toUpperCase())];
}

function googleSegment(from: string, date: string, to: string) {
  return [
    ...pbBytes(13, googleAirportBlob(from)),
    ...pbString(2, date),
    ...pbBytes(14, googleAirportBlob(to)),
  ];
}

function toBase64Url(bytes: number[]) {
  const bin = String.fromCharCode(...bytes);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Temiz tfs + #flt. /search?q= ve tfu Google anasayfasına atıyor. */
export function googleFlightsSearchUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDest: string,
  retDate: string,
) {
  const passengers = [
    ...pbTag(1, 0),
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0x01,
  ];
  const body = [
    ...pbVarintField(1, 28),
    ...pbVarintField(2, 2),
    ...pbBytes(3, googleSegment(outOrigin, outDate, dest)),
    ...pbBytes(3, googleSegment(dest, retDate, retDest)),
    ...pbVarintField(14, 1),
    ...pbBytes(16, passengers),
    ...pbVarintField(8, 1),
    ...pbVarintField(9, 1),
    ...pbVarintField(19, 1),
  ];
  const tfs = toBase64Url(body);
  const flt = `${outOrigin}.${dest}.${outDate}*${dest}.${retDest}.${retDate}`;
  return `https://www.google.com/travel/flights?hl=tr&gl=tr&curr=USD&sort=2&tfs=${tfs}#flt=${flt}`;
}

/** Kiwi arama — tarih + rota dolu. */
export function kiwiSearchUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
) {
  const params = new URLSearchParams({
    from: outOrigin.toUpperCase(),
    to: dest.toUpperCase(),
    departure: outDate,
    return: retDate,
    currency: "usd",
  });
  return `https://www.kiwi.com/deep?${params.toString()}`;
}

/**
 * Travelpayouts üzerinden Kiwi. Marker yoksa link üretilmez.
 * @see https://support.travelpayouts.com/hc/en-us/articles/360010109719-Kiwi-com-affiliate-links
 */
export function kiwiAffiliateUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
  subId?: string,
) {
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim();
  if (!marker) return undefined;
  const deep = kiwiSearchUrl(outOrigin, dest, outDate, retDate);
  const shmarker = subId ? `${marker}.${subId}` : marker;
  const params = new URLSearchParams({
    shmarker,
    promo_id: "3791",
    source_type: "customlink",
    type: "click",
    custom_url: deep,
  });
  return `https://c111.travelpayouts.com/click?${params.toString()}`;
}

/** Vitrin CTA — yalnız anlaşmalı OTA (Kiwi). Google yok. */
export function dealBookingUrl(deal: Deal) {
  const out = dealOutOrigin(deal);
  const dest = dealDestCode(deal);
  const od = deal.outboundDate;
  const rd = deal.returnDate;
  if (
    out &&
    dest &&
    od &&
    rd &&
    /^\d{4}-\d{2}-\d{2}$/.test(od) &&
    /^\d{4}-\d{2}-\d{2}$/.test(rd)
  ) {
    return kiwiAffiliateUrl(out, dest, od, rd, dealDestCode(deal) || undefined);
  }
  return undefined;
}

export function cheapestDealPerCity(deals: Deal[]) {
  const best = new Map<string, Deal>();
  for (const deal of deals) {
    const key = dealDestCode(deal) || deal.destination;
    const cur = best.get(key);
    if (!cur || deal.price < cur.price) best.set(key, deal);
  }
  return deals.filter((deal) => {
    const key = dealDestCode(deal) || deal.destination;
    return best.get(key)?.id === deal.id;
  });
}

export function otherCityDeals(current: Deal, all: Deal[]) {
  const code = dealDestCode(current);
  if (!code) return [];
  return all
    .filter((d) => d.id !== current.id && dealDestCode(d) === code)
    .sort(
      (a, b) =>
        (a.outboundDate ?? "").localeCompare(b.outboundDate ?? "") ||
        a.price - b.price,
    );
}

export function dealHref(deal: Deal) {
  return `/firsatlarim/${encodeURIComponent(deal.id)}`;
}

export function dealMatchesDeparture(deal: Deal, departureCode: string) {
  if (departureCode === "IST_ONLY") return dealOutOrigin(deal) === "IST";
  if (departureCode === "SAW_ONLY") return dealOutOrigin(deal) === "SAW";
  return true;
}

export function dealMatchesOrigins(deal: Deal, origins: string[]) {
  if (origins.length === 0) return true;
  return origins.includes(dealOutOrigin(deal));
}

export function dealMatchesDests(deal: Deal, dests: string[]) {
  if (dests.length === 0) return true;
  return dests.includes(dealDestCode(deal));
}

export function dealCabin() {
  return "Ekonomi";
}

/** Kart altı soluk kod: D… Google Deals, S… Scrappa. */
export function dealSourceCipher(deal: Deal) {
  const prefix = deal.id.startsWith("gdeals:")
    ? "D"
    : deal.id.startsWith("scrappa:")
      ? "S"
      : null;
  if (!prefix) return null;
  const letters = "BCDFGHJKMNPQRTVWXZ";
  let n = 2166136261;
  for (const ch of deal.id) {
    n ^= ch.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  let tail = "";
  let x = n >>> 0;
  for (let i = 0; i < 4; i++) {
    tail += letters[x % letters.length];
    x = Math.floor(x / letters.length);
  }
  return prefix + tail;
}

/** Tek yön IST+SAW toplamı; paket doğrulanmamış. Vitrine konmaz. */
export function isUnverifiedOneWaySum(deal: Deal) {
  if (!deal.id.startsWith("scrappa:")) return false;
  return dealOutOrigin(deal) !== dealReturnAirport(deal);
}

export function dealWithinStopLimit(deal: Deal) {
  if (typeof deal.stops !== "number") return true;
  return deal.stops <= maxStopsForDest(dealDestCode(deal));
}

export function dealStopsLabel(deal: Deal) {
  if (typeof deal.stops !== "number") return "Google’da kontrol et";
  const base = deal.stops === 0 ? "Direkt" : `${deal.stops} aktarma`;
  if (deal.selfTransfer) {
    return `${base} · yolcu sorumluluğunda aktarma`;
  }
  return base;
}
