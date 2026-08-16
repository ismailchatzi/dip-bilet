import type { Deal } from "@/lib/types";

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

export function dealBookingUrl(deal: Deal) {
  const stored = deal.googleFlightsUrl ?? "";
  if (stored.includes("tfs=")) return stored;

  const out = dealOutOrigin(deal);
  const dest = dealDestCode(deal);
  const ret = dealReturnAirport(deal);
  const od = deal.outboundDate;
  const rd = deal.returnDate;
  if (out && dest && od && rd) {
    const q = `Flights from ${out} to ${dest} on ${od} returning ${rd} to ${ret}`;
    return `https://www.google.com/travel/flights/search?hl=tr&gl=tr&curr=USD&q=${encodeURIComponent(q)}`;
  }
  return stored.includes("/travel/flights/search") ? stored : undefined;
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

export function dealStopsLabel(deal: Deal) {
  if (typeof deal.stops !== "number") return "Google’da kontrol et";
  if (deal.stops === 0) return "Direkt";
  return `${deal.stops} aktarma`;
}
