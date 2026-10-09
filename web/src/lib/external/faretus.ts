import { politeFetch } from "@/lib/external/http";
import { cleanPairs, istanbulCode, skyscannerPathPair } from "@/lib/external/pairs";
import type { ExternalDeal, SourceState } from "@/lib/external/types";

export const FARETUS_SOURCE = "faretus";
/** Sitenin kendi (Strapi) herkese açık API'si — İstanbul kalkışlı ilanlar, yeniden eskiye. */
const API_URL =
  "https://api.faretus.com/api/deals?filters[OriginCity][$containsi]=istanbul&sort=publishedAt:desc&pagination[pageSize]=25";
const SITE_URL = "https://www.faretus.com/deal/";

type FaretusDeal = {
  documentId: string;
  Title: string;
  Type: string | null;
  TripType: string | null;
  OriginCity: string | null;
  OriginCode: string | null;
  DestinationCity: string | null;
  DestinationCode: string | null;
  DestinationCountry: string | null;
  Price: number | null;
  Currency: string | null;
  BookingLink: string | null;
  Description: { children?: { text?: string }[] }[] | null;
  TravelStartDate: string | null;
  TravelEndDate: string | null;
  TelegramPostUrl: string | null;
  publishedAt: string | null;
  Cabin: string | null;
  Airline: string | null;
  Transfers: number | null;
  DatesNote: string | null;
  ExpiredAt: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function descriptionText(d: FaretusDeal["Description"]) {
  return (d ?? [])
    .map((p) => (p.children ?? []).map((c) => c.text ?? "").join(""))
    .filter(Boolean)
    .join("\n");
}

export function faretusToDeal(d: FaretusDeal): ExternalDeal | null {
  if (d.Type && d.Type !== "Flight") return null;
  const origin = d.OriginCode ? istanbulCode(d.OriginCode) : null;
  if (!origin) return null;
  const dest = d.DestinationCode?.toUpperCase() ?? null;
  const link = d.BookingLink ? skyscannerPathPair(d.BookingLink) : null;
  const pairs = link ? cleanPairs([{ ...link, from: origin, to: dest ?? link.to }]) : [];
  return {
    source: FARETUS_SOURCE,
    sourceId: d.documentId,
    url: `${SITE_URL}${slugify(d.Title)}-${d.documentId}`,
    title: d.Title,
    publishedAt: d.publishedAt,
    origin,
    destCode: dest,
    price: d.Price,
    currency: d.Currency,
    tripType: d.TripType === "One-Way" ? "ow" : d.TripType === "Round-Trip" ? "rt" : null,
    stops: d.Transfers,
    datePairs: pairs,
    details: {
      destName: [d.DestinationCity, d.DestinationCountry].filter(Boolean).join(", ") || null,
      travelFrom: d.TravelStartDate,
      travelTo: d.TravelEndDate,
      datesNote: d.DatesNote,
      cabin: d.Cabin,
      airline: d.Airline,
      expiredAt: d.ExpiredAt,
      bookingLink: d.BookingLink,
      telegram: d.TelegramPostUrl,
      summary: descriptionText(d.Description).slice(0, 600),
    },
  };
}

export async function readFaretus(
  state: SourceState,
  isKnown: (ids: string[]) => Promise<Set<string>>,
): Promise<{ deals: ExternalDeal[]; note: string }> {
  const res = await politeFetch(API_URL, state);
  if (res.status === "blocked") return { deals: [], note: `engel ${res.code} → ${state.blockedUntil} kadar bekle` };
  if (res.status !== "ok") return { deals: [], note: res.status === "error" ? `hata: ${res.message}` : "değişiklik yok" };

  let rows: FaretusDeal[];
  try {
    rows = (JSON.parse(res.body) as { data?: FaretusDeal[] }).data ?? [];
  } catch {
    return { deals: [], note: "hata: JSON okunamadı" };
  }
  const all = rows.map(faretusToDeal).filter((d): d is ExternalDeal => d != null);
  const known = await isKnown(all.map((d) => d.sourceId));
  const deals = all.filter((d) => !known.has(d.sourceId));
  return { deals, note: `${rows.length} İstanbul ilanı, ${deals.length} yeni` };
}
