import type { SupabaseClient } from "@supabase/supabase-js";
import { apiBase } from "./supabase";
import { cardPhotoUrl } from "./photos";

export type DateOption = {
  outboundDate: string;
  returnDate: string;
  price: number;
  foundAt?: string;
  airline?: string;
  destAirport?: string;
};

export type Deal = {
  id: string;
  destination: string;
  price: number;
  averagePrice?: number;
  thresholdPrice?: number;
  currency: string;
  outboundDate?: string;
  returnDate?: string;
  airline?: string;
  stops?: number;
  departureLabel: string;
  cardImage?: string;
  destAirport?: string;
  dateOptions?: DateOption[];
  foundAt?: string;
  verifiedAt?: string;
  photoUrl?: string;
  selfTransfer?: boolean;
  dealBadge?: string;
};

const PREFIXES = new Set(["scrappa", "gdeals", "manual", "external"]);

function parts(deal: Deal) {
  const bits = deal.id.split(":");
  return PREFIXES.has(bits[0] ?? "") ? bits : null;
}

export function screenPrice(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return amount;
  return Math.floor(amount * 0.97);
}

export function money(amount: number, currency = "USD") {
  if (currency === "USD") return `$${Math.round(amount).toLocaleString("en-US")}`;
  return `${Math.round(amount).toLocaleString("tr-TR")} ${currency}`;
}

export function cityName(deal: Deal) {
  return deal.destination.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
}

export function originCode(deal: Deal) {
  return parts(deal)?.[2] || "IST";
}

/** Şehir kodu (CDG) — site `dealDestCode` ile aynı. Uçulan havalimanı = `destAirport`. */
export function destCode(deal: Deal) {
  const fromId = parts(deal)?.[1]?.trim().toUpperCase();
  if (fromId) return fromId;
  return deal.destination.match(/\b([A-Z]{3})\b/)?.[1] ?? "";
}

export function stopsLabel(stops?: number) {
  if (stops == null) return "";
  if (stops <= 0) return "Direkt";
  return stops === 1 ? "1 aktarma" : `${stops} aktarma`;
}

export function dateLabel(iso?: string) {
  if (!iso) return "";
  const t = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function rangeLabel(out?: string, ret?: string) {
  const a = dateLabel(out);
  const b = dateLabel(ret);
  if (a && b) return `${a} – ${b}`;
  return a || b || "Tarih yok";
}

function turkeyTodayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function foundDayTr(foundAt?: string) {
  if (!foundAt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(foundAt)) return foundAt;
  const t = Date.parse(foundAt);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function nightsBetween(a: string, b: string) {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

/** Vitrin kartı / hero: yakalanalı ≥3 takvim günü → eski fırsat (site ile aynı). */
export function isOldShowcaseDeal(
  deal: Pick<Deal, "foundAt">,
  today = turkeyTodayIso(),
) {
  const day = foundDayTr(deal.foundAt);
  if (!day) return false;
  return nightsBetween(day, today) >= 3;
}

/** Diğer tarihler: yakalanalı ≥2 takvim günü → eski fırsat. */
export function isOldDateOption(foundAt?: string, today = turkeyTodayIso()) {
  const day = foundDayTr(foundAt);
  if (!day) return false;
  return nightsBetween(day, today) >= 2;
}

/** Diğer tarihlerde hero’dan ucuz ve taze seçenek vurgusu (site ile aynı). */
export function isCheaperFreshDateOption(
  optPrice: number,
  heroPrice: number,
  foundAt?: string,
  today = turkeyTodayIso(),
) {
  return (
    !isOldDateOption(foundAt, today) &&
    screenPrice(optPrice) < screenPrice(heroPrice)
  );
}

export type DealDateChoice = {
  outboundDate: string;
  returnDate: string;
  price: number;
  foundAt?: string;
  airline?: string;
  destAirport?: string;
};

/**
 * Site `dealPriceCapUsd` ile uyum:
 * - Elle eşikli şehirde `thresholdPrice` = ekran eşiği → ham tavan (thr+1)/0.97
 * - Diğerinde `thresholdPrice` zaten ham kapı
 */
export function dealPriceCap(deal: Deal): number | null {
  const thr = deal.thresholdPrice;
  if (typeof thr !== "number" || !(thr > 0)) return null;
  // Hero ham > thr ama ekran ≤ thr → thr ekran eşiği (ATH 93 vb.)
  if (deal.price > thr && screenPrice(deal.price) <= thr) {
    return (thr + 1) / 0.97 - 1e-6;
  }
  // Hero ham ≤ thr → thr ham kapı gibi kullanılabilir
  if (deal.price <= thr) return thr;
  // Hero her iki anlamda da üstte: yine de ekran eşiği varsay (alt tarihler kalsın)
  if (screenPrice(deal.price) > thr) {
    return (thr + 1) / 0.97 - 1e-6;
  }
  return thr;
}

/**
 * Site `dealDateChoices`: eşik üstü tarihler listeden düşer.
 */
export function dealDateChoices(deal: Deal): DealDateChoice[] {
  const cap = dealPriceCap(deal);
  const heroKey =
    deal.outboundDate && deal.returnDate
      ? `${deal.outboundDate}|${deal.returnDate}`
      : "";
  const head: DealDateChoice[] =
    deal.outboundDate && deal.returnDate
      ? [
          {
            outboundDate: deal.outboundDate,
            returnDate: deal.returnDate,
            price: deal.price,
            foundAt: deal.foundAt,
            airline: deal.airline,
            destAirport: deal.destAirport,
          },
        ]
      : [];
  const extra = (deal.dateOptions ?? []).filter(
    (o) =>
      o.outboundDate &&
      o.returnDate &&
      `${o.outboundDate}|${o.returnDate}` !== heroKey,
  );
  return [...head, ...extra].filter(
    (o) =>
      o.outboundDate &&
      o.returnDate &&
      (cap == null || (o.price > 0 && o.price <= cap)),
  );
}

/** Bu kart ailesindeki en ucuz geçerli tarih (En dip için). */
export function familyLowPrice(deal: Deal): number | null {
  const prices = dealDateChoices(deal)
    .map((c) => c.price)
    .filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export function foundLabel(foundAt?: string) {
  const day = foundDayTr(foundAt);
  if (!day) return null;
  const t = new Date(`${day}T12:00:00`);
  const label = t.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return `${label}’da yakalandı`;
}

export function discountPercent(deal: {
  price: number;
  averagePrice?: number;
}) {
  const avg = deal.averagePrice;
  if (typeof avg !== "number" || avg <= 0) return null;
  const shown = screenPrice(deal.price);
  const pct = Math.round(((avg - shown) / avg) * 100);
  return pct > 0 ? pct : null;
}

const TURKEY_IATA = new Set([
  "IST", "SAW", "ESB", "ADB", "AYT", "BJV", "DLM", "TZX", "ASR", "GZT",
  "VAN", "DIY", "ERZ", "ADA", "KYA", "MLX", "SZF", "BZI", "MSR", "ECN",
  "NAV", "KSY", "KCM", "OGU", "RZV", "DNZ", "MQM", "BAL", "NKT", "AOE",
]);

export type FlightTypeFilter = "domestic" | "international";

export function isDomesticDeal(deal: Deal) {
  const code = destCode(deal).toUpperCase();
  return TURKEY_IATA.has(code);
}

export function dealMatchesFlightTypes(
  deal: Deal,
  types: FlightTypeFilter[],
) {
  if (types.length === 0 || types.length === 2) return true;
  if (types[0] === "domestic") return isDomesticDeal(deal);
  return !isDomesticDeal(deal);
}

export function dealMatchesOrigins(deal: Deal, origins: string[]) {
  if (origins.length === 0) return true;
  return origins.includes(originCode(deal));
}

export function dealMatchesDests(deal: Deal, dests: string[]) {
  if (dests.length === 0) return true;
  const city = destCode(deal).toUpperCase();
  return dests.some((c) => c.trim().toUpperCase() === city);
}

export function cityLowDeal(deals: Deal[], code: string): Deal | null {
  const key = code.trim().toUpperCase();
  let best: Deal | null = null;
  for (const d of deals) {
    if (destCode(d).toUpperCase() !== key) continue;
    if (!best || d.price < best.price) best = d;
  }
  return best;
}

/** Push dealId → vitrinde kart (önce id, yoksa şehir). */
export function findDealByPushId(deals: Deal[], dealId: string): Deal | null {
  const id = dealId.trim();
  if (!id) return null;
  const exact = deals.find((d) => d.id === id);
  if (exact) return exact;
  const bits = id.split(":");
  const city = (PREFIXES.has(bits[0] ?? "") ? bits[1] : bits[0])
    ?.trim()
    .toUpperCase();
  if (!city) return null;
  return cityLowDeal(deals, city);
}

/** Hero veya diğer tarihlerde ilk dolu havayolu (rematch bazen yalnız option’da bırakıyor). */
export function resolveAirline(
  deal: Deal,
  choiceAirline?: string | null,
): string | null {
  const pick = (v?: string | null) => {
    const t = v?.trim();
    return t ? t : null;
  };
  return (
    pick(choiceAirline) ||
    pick(deal.airline) ||
    pick((deal.dateOptions ?? []).find((o) => pick(o.airline))?.airline) ||
    null
  );
}

function normalizeDeal(raw: Deal): Deal {
  const code = raw.destAirport?.trim() || destCode(raw) || "";
  const photo =
    (raw.cardImage && raw.cardImage.startsWith("http") ? raw.cardImage : undefined) ||
    (raw.photoUrl && raw.photoUrl.startsWith("http") ? raw.photoUrl : undefined) ||
    cardPhotoUrl(code || raw.destination);
  const airline = resolveAirline(raw) ?? undefined;
  return {
    ...raw,
    airline,
    currency: raw.currency || "USD",
    departureLabel: raw.departureLabel || "İstanbul",
    cardImage: photo,
  };
}

/**
 * Site ile aynı vitrin: her zaman /api/deals (hero + eşik sunucuda).
 * 401/5xx olursa hata fırlat — ham scan_board yedek kullanma (eski kart riski).
 */
export async function fetchShowcaseDeals(client: SupabaseClient): Promise<Deal[]> {
  const {
    data: { session },
  } = await client.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Oturum yok");

  const res = await fetch(`${apiBase}/api/deals`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Supabase-Access-Token": token,
      "X-Dipbilet-Token": token,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Vitrin açılamadı (${res.status})`);
  }
  const json = (await res.json()) as { deals?: Deal[] };
  return (json.deals ?? []).map(normalizeDeal);
}
