import {
  decodeEntities,
  forgetFeedVersion,
  htmlToText,
  parseRssItems,
  politeFetch,
  sleep,
} from "@/lib/external/http";
import { cleanPairs, mostCommon } from "@/lib/external/pairs";
import type { ExternalDatePair, ExternalDeal, SourceState } from "@/lib/external/types";

export const UCUZAUCAK_SOURCE = "ucuzaucak";
const FEED_URL = "https://ucuzaucak.net/feed/?post_type=ucak-bileti";
const DETAIL_GAP_MS = 3_000;

/** Detay sayfasındaki "Bileti gör" Skyscanner linkleri: origin, destination, outboundDate, inboundDate. */
export function skyscannerPairs(html: string, today?: string): ExternalDatePair[] {
  const pairs: ExternalDatePair[] = [];
  for (const m of html.matchAll(/href="([^"]*skyscanner[^"]*outboundDate[^"]*)"/g)) {
    const url = decodeEntities(m[1]!);
    const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const from = q.get("origin")?.toUpperCase();
    const to = q.get("destination")?.toUpperCase();
    const out = q.get("outboundDate");
    if (!from || !to || !out) continue;
    pairs.push({ from, to, out, ret: q.get("inboundDate") || null });
  }
  return cleanPairs(pairs, today);
}

/** "134£ ~8.782₺" → { gbp: 134, try: 8782 } (ilk "£ ~ ₺" çifti; "normalde 245£ iken" sayılmaz). */
export function parseUcuzaucakPrice(text: string) {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*£\s*~\s*([\d.]+)\s*₺/);
  if (!m) return null;
  return {
    gbp: Number(m[1]!.replace(",", ".")),
    try: Number(m[2]!.replace(/\./g, "")),
  };
}

export function parseStops(text: string): number | null {
  if (/aktarmas[ıi]z/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*aktarmal[ıi]/i);
  return m ? Number(m[1]) : null;
}

/**
 * Yeni ilanları okur. Bilinen ilanlar (isKnown) için detay sayfasına girilmez.
 * RSS değişmediyse (304) hiçbir şey indirilmez.
 */
export async function readUcuzaucak(
  state: SourceState,
  isKnown: (ids: string[]) => Promise<Set<string>>,
): Promise<{ deals: ExternalDeal[]; note: string }> {
  const feed = await politeFetch(FEED_URL, state, { conditional: true });
  if (feed.status === "unchanged") return { deals: [], note: "değişiklik yok (304)" };
  if (feed.status === "blocked") return { deals: [], note: `engel ${feed.code} → ${state.blockedUntil} kadar bekle` };
  if (feed.status === "error") return { deals: [], note: `hata: ${feed.message}` };

  const items = parseRssItems(feed.body);
  const known = await isKnown(items.map((i) => i.guid));
  const fresh = items.filter((i) => !known.has(i.guid));
  const deals: ExternalDeal[] = [];

  for (const item of fresh) {
    if (deals.length > 0) await sleep(DETAIL_GAP_MS);
    const detail = await politeFetch(item.link, state);
    if (detail.status === "blocked") {
      forgetFeedVersion(state);
      break;
    }
    const pairs = detail.status === "ok" ? skyscannerPairs(detail.body) : [];
    const text = htmlToText(item.content);
    const price = parseUcuzaucakPrice(text);
    const hasReturn = pairs.some((p) => p.ret);
    deals.push({
      source: UCUZAUCAK_SOURCE,
      sourceId: item.guid,
      url: item.link,
      title: item.title,
      publishedAt: item.pubDate,
      origin: mostCommon(pairs.map((p) => p.from)),
      destCode: mostCommon(pairs.map((p) => p.to)),
      price: price?.gbp ?? null,
      currency: price ? "GBP" : null,
      tripType: pairs.length ? (hasReturn ? "rt" : "ow") : /tek y[öo]n/i.test(text) ? "ow" : null,
      stops: parseStops(text),
      datePairs: pairs,
      details: {
        priceTry: price?.try ?? null,
        summary: text.slice(0, 600),
        detailStatus: detail.status,
      },
    });
  }

  return { deals, note: `${items.length} ilan, ${fresh.length} yeni` };
}
