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

function aviasalesSearchSlug(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
) {
  const [, om, od] = outDate.split("-");
  const [, rm, rd] = retDate.split("-");
  return `${outOrigin.toUpperCase()}${od}${om}${dest.toUpperCase()}${rd}${rm}1`;
}

/** Aviasales arama — /search slug otomatik tarar; anasayfa query otomatik başlamıyor. */
export function aviasalesSearchUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
) {
  const slug = aviasalesSearchSlug(outOrigin, dest, outDate, retDate);
  const params = new URLSearchParams({
    origin_iata: outOrigin.toUpperCase(),
    destination_iata: dest.toUpperCase(),
    depart_date: outDate,
    return_date: retDate,
    adults: "1",
    children: "0",
    infants: "0",
    trip_class: "0",
    currency: "usd",
    locale: "en",
    with_request: "true",
  });
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim();
  if (marker) params.set("marker", marker);
  return `https://www.aviasales.com/search/${slug}?${params.toString()}`;
}

/**
 * Travelpayouts Aviasales. p=4114 hesap link üretecinden.
 * @see https://support.travelpayouts.com/hc/en-us/articles/5711895629714-Aviasales-affiliate-links
 */
export function aviasalesAffiliateUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
  subId?: string,
) {
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER?.trim();
  if (!marker) return undefined;
  const deep = aviasalesSearchUrl(outOrigin, dest, outDate, retDate);
  const params = new URLSearchParams({
    campaign_id: "100",
    marker: subId ? `${marker}.${subId}` : marker,
    p: "4114",
    trs: "560475",
    u: deep,
  });
  return `https://tp.media/r?${params.toString()}`;
}

/** Trip.com şehir kodu — İstanbul tek şehir; Roma/Paris havalimanı değil şehir. */
const TRIPCOM_CITY: Record<string, string> = {
  IST: "IST",
  SAW: "IST",
  FCO: "ROM",
  CIA: "ROM",
  CDG: "PAR",
  ORY: "PAR",
};

function tripcomCity(iata: string) {
  const code = iata.toUpperCase();
  return TRIPCOM_CITY[code] ?? code;
}

/**
 * Trip.com gidiş-dönüş. Allianceid/SID yoksa link yok.
 * @see Account → Affiliate Link (Flights)
 */
export function tripcomAffiliateUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
  subId?: string,
) {
  const alliance = process.env.TRIPCOM_ALLIANCE_ID?.trim();
  const sid = process.env.TRIPCOM_SID?.trim();
  if (!alliance || !sid) return undefined;
  const dcity = tripcomCity(outOrigin);
  const acity = tripcomCity(dest);
  const params = new URLSearchParams({
    flighttype: "D",
    dcity,
    acity,
    ddate: outDate,
    adate: retDate,
    Allianceid: alliance,
    SID: sid,
  });
  const sub1 = subId?.trim();
  if (sub1) params.set("trip_sub1", sub1);
  const sub3 = process.env.TRIPCOM_TRIP_SUB3?.trim();
  if (sub3) params.set("trip_sub3", sub3);
  return `https://www.trip.com/flights/tickets-${dcity}-${acity}?${params.toString()}`;
}

/** Vitrin CTA — tıklanınca Kiwi vs Aviasales, ucuz olan (yoksa Trip.com / Aviasales). */
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
    const params = new URLSearchParams({
      o: out,
      d: dest,
      out: od,
      ret: rd,
    });
    const sub = dealDestCode(deal);
    if (sub) params.set("sub", sub);
    const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
    return `${base}/api/deals/book?${params.toString()}`;
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

/** Gidiş ±7 gün = aynı fırsat kümesi (vitrinde tek kart). */
export const DATE_CLUSTER_DAYS = 7;

function outboundDaysApart(a?: string, b?: string) {
  if (!a || !b) return Infinity;
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(ms)) return Infinity;
  return Math.abs(Math.round(ms / 86_400_000));
}

export function sameDateCluster(a: Deal, b: Deal) {
  return outboundDaysApart(a.outboundDate, b.outboundDate) <= DATE_CLUSTER_DAYS;
}

/** Şehir başına en fazla 2 kart; yakın tarihler tek kahramanda birleşir. */
export function vitrinHeroDeals(deals: Deal[]) {
  const byCity = new Map<string, Deal[]>();
  for (const deal of deals) {
    const key = dealDestCode(deal) || deal.destination;
    const list = byCity.get(key) ?? [];
    list.push(deal);
    byCity.set(key, list);
  }
  const heroes: Deal[] = [];
  for (const group of byCity.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        a.price - b.price || (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
    );
    const used = new Set<string>();
    let taken = 0;
    for (const deal of sorted) {
      if (used.has(deal.id)) continue;
      heroes.push(deal);
      taken += 1;
      used.add(deal.id);
      for (const other of sorted) {
        if (used.has(other.id)) continue;
        if (sameDateCluster(deal, other)) used.add(other.id);
      }
      if (taken >= 2) break;
    }
  }
  return heroes;
}

export function otherCityDeals(current: Deal, all: Deal[]) {
  const code = dealDestCode(current);
  if (!code) return [];
  return all
    .filter(
      (d) =>
        d.id !== current.id &&
        dealDestCode(d) === code &&
        sameDateCluster(current, d) &&
        d.price === current.price,
    )
    .sort(
      (a, b) =>
        (a.outboundDate ?? "").localeCompare(b.outboundDate ?? "") ||
        a.price - b.price,
    );
}

export type DealDateChoice = {
  outboundDate: string;
  returnDate: string;
  price: number;
  airline?: string;
  origin?: string;
};

export function dealDateChoices(deal: Deal): DealDateChoice[] {
  const origin = dealOutOrigin(deal);
  const head: DealDateChoice[] =
    deal.outboundDate && deal.returnDate
      ? [
          {
            outboundDate: deal.outboundDate,
            returnDate: deal.returnDate,
            price: deal.price,
            airline: deal.airline,
            origin,
          },
        ]
      : [];
  const extra = (deal.dateOptions ?? []).filter(
    (o) =>
      o.outboundDate &&
      o.returnDate &&
      `${o.outboundDate}|${o.returnDate}` !==
        `${deal.outboundDate}|${deal.returnDate}`,
  );
  return [...head, ...extra];
}

export function dealWithDateChoice(deal: Deal, choice: DealDateChoice): Deal {
  const dest = dealDestCode(deal);
  const origin = (choice.origin || dealOutOrigin(deal)).toUpperCase();
  const prefix = deal.id.startsWith("gdeals:") ? "gdeals" : "scrappa";
  return {
    ...deal,
    price: choice.price,
    outboundDate: choice.outboundDate,
    returnDate: choice.returnDate,
    airline: choice.airline || deal.airline,
    departureLabel: `İstanbul (${origin})`,
    id: dest
      ? `${prefix}:${dest}:${origin}:${choice.outboundDate}:${origin}:${choice.returnDate}`
      : deal.id,
  };
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

/** Kart altı soluk kod: D… Google / S… Scrappa + 4 harf + eklenme saati HHMM (TR). */
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
  const hhmm = foundAtHhmmTr(deal.foundAt);
  return hhmm ? `${prefix}${tail}${hhmm}` : `${prefix}${tail}`;
}

/** foundAt → TR saati HHMM (örn. 02:35 → 0235). */
function foundAtHhmmTr(foundAt?: string) {
  if (!foundAt) return null;
  const t = Date.parse(foundAt);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  if (!hour || !minute) return null;
  return `${hour}${minute}`;
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
  if (typeof deal.stops !== "number") return "—";
  const base = deal.stops === 0 ? "Direkt" : `${deal.stops} aktarma`;
  if (deal.selfTransfer) {
    return `${base} · yolcu sorumluluğunda aktarma`;
  }
  return base;
}
