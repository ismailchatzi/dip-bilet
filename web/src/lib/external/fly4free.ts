import {
  decodeEntities,
  forgetFeedVersion,
  htmlToText,
  parseRssItems,
  politeFetch,
  sleep,
} from "@/lib/external/http";
import {
  cleanPairs,
  istanbulCode,
  mostCommon,
  skyscannerPathPair,
} from "@/lib/external/pairs";
import type { ExternalDatePair, ExternalDeal, SourceState } from "@/lib/external/types";

export const FLY4FREE_SOURCE = "fly4free";
const FEED_URL = "https://www.fly4free.com/feed/";
const DETAIL_GAP_MS = 3_000;
/** Tur başına en fazla bu kadar detay sayfası; kalanlar sonraki turda. */
const MAX_DETAILS_PER_RUN = 8;
const MAX_SKIPPED = 300;

/** Skyscanner şehir kodları 4 harfli olabiliyor (BKKT) → ilk 3 harf. */
function airportCode(code: string) {
  return code.toUpperCase().slice(0, 3);
}

/**
 * Detaydaki "Bileti gör" linkleri:
 * Kayak  …/flights/SAW-KUL/2027-02-17/2027-03-01
 * Skyscanner (u= içinde) …/transport/flights/ist/del/261124/261202/
 */
export function fly4freeLinkPairs(html: string, today?: string): ExternalDatePair[] {
  const pairs: ExternalDatePair[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let url = decodeEntities(decodeEntities(m[1]!));
    if (/skyscanner/i.test(url)) {
      const u = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("u");
      if (u) url = decodeURIComponent(u);
    }
    const kayak = url.match(/\/flights\/([A-Z]{3})-([A-Z]{3})\/(\d{4}-\d{2}-\d{2})(?:\/(\d{4}-\d{2}-\d{2}))?/i);
    if (kayak) {
      pairs.push({
        from: airportCode(kayak[1]!),
        to: airportCode(kayak[2]!),
        out: kayak[3]!,
        ret: kayak[4] ?? null,
      });
      continue;
    }
    const sky = skyscannerPathPair(url);
    if (sky) pairs.push(sky);
  }
  return cleanPairs(pairs, today);
}

/** "Label:\nmetin\nSonraki:" bloğundan metin. */
function field(text: string, label: string) {
  const m = text.match(new RegExp(`${label}:\\s*\\n?([^\\n]+)`, "i"));
  return m?.[1]?.trim() ?? null;
}

const CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD" };

/** Başlıktaki "for €359" / "from £479"; yoksa gövdedeki "Flights €377 RT". */
export function parseFly4freePrice(title: string, text: string) {
  for (const src of [title, text.match(/Flights\s*[€£$]\s*\d[\d,.]*/i)?.[0] ?? ""]) {
    const m = src.match(/([€£$])\s*(\d[\d,]*(?:\.\d+)?)/);
    if (m) return { amount: Number(m[2]!.replace(/,/g, "")), currency: CURRENCY[m[1]!]! };
  }
  return null;
}

function rememberSkipped(state: SourceState, id: string) {
  const list = state.skipped ?? [];
  if (!list.includes(id)) list.push(id);
  state.skipped = list.slice(-MAX_SKIPPED);
}

/**
 * Ana akış (tam metin yok) → yalnız uçuş ilanlarının detayına girilir.
 * Rota İstanbul'dan başlıyorsa ya da linklerde IST/SAW kalkışlı tarih varsa kaydedilir.
 */
export async function readFly4free(
  state: SourceState,
  isKnown: (ids: string[]) => Promise<Set<string>>,
): Promise<{ deals: ExternalDeal[]; note: string }> {
  const feed = await politeFetch(FEED_URL, state, { conditional: true });
  if (feed.status === "unchanged") return { deals: [], note: "değişiklik yok (304)" };
  if (feed.status === "blocked") return { deals: [], note: `engel ${feed.code} → ${state.blockedUntil} kadar bekle` };
  if (feed.status === "error") return { deals: [], note: `hata: ${feed.message}` };

  const items = parseRssItems(feed.body).filter((i) => /\bflights?\b/i.test(i.title));
  const known = await isKnown(items.map((i) => i.guid));
  const skipped = new Set(state.skipped ?? []);
  const fresh = items.filter((i) => !known.has(i.guid) && !skipped.has(i.guid));
  const batch = fresh.slice(0, MAX_DETAILS_PER_RUN);
  if (fresh.length > batch.length) forgetFeedVersion(state);

  const deals: ExternalDeal[] = [];
  let checked = 0;
  for (const item of batch) {
    if (checked > 0) await sleep(DETAIL_GAP_MS);
    checked++;
    const detail = await politeFetch(item.link, state);
    if (detail.status === "blocked") {
      forgetFeedVersion(state);
      break;
    }
    if (detail.status !== "ok") {
      forgetFeedVersion(state);
      continue;
    }

    const text = htmlToText(detail.body);
    const datesAt = text.indexOf("Travel dates:");
    const body = datesAt >= 0 ? text.slice(Math.max(0, datesAt - 1500)) : text;
    const route = field(body, "Route");
    const routeFromIstanbul = !!route && /^[^–-]*istanbul/i.test(route);
    const allPairs = fly4freeLinkPairs(detail.body);
    const istPairs = allPairs.filter((p) => istanbulCode(p.from));
    if (!routeFromIstanbul && istPairs.length === 0) {
      rememberSkipped(state, item.guid);
      continue;
    }

    const pairs = istPairs.map((p) => ({ ...p, from: istanbulCode(p.from)! }));
    const routeSaw = route ? /^[^–-]*\(SAW\)/i.test(route) : false;
    const price = parseFly4freePrice(item.title, body);
    const ow = /one[- ]way/i.test(`${item.title} ${body.slice(0, 1500)}`);
    const rt = /\bRT\b|round[- ]trip|return/i.test(`${item.title} ${body.slice(0, 1500)}`);
    deals.push({
      source: FLY4FREE_SOURCE,
      sourceId: item.guid,
      url: item.link,
      title: item.title,
      publishedAt: item.pubDate,
      origin: mostCommon(pairs.map((p) => p.from)) ?? (routeSaw ? "SAW" : "IST"),
      destCode: mostCommon(pairs.map((p) => p.to)),
      price: price?.amount ?? null,
      currency: price?.currency ?? null,
      tripType: ow && !rt ? "ow" : rt ? "rt" : null,
      stops: /non-?stop|direct/i.test(item.title) ? 0 : null,
      datePairs: pairs,
      details: {
        route,
        travelDates: field(body, "Travel dates"),
        baggage: field(body, "Baggage allowance"),
        multiOrigin: !routeFromIstanbul,
        summary: decodeEntities(item.content).slice(0, 600),
      },
    });
  }

  return {
    deals,
    note: `${items.length} uçuş ilanı, ${fresh.length} yeni, ${checked} incelendi, ${deals.length} İstanbul`,
  };
}
