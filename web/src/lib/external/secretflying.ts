import { decodeEntities, htmlToText, isBlocked, politeFetch, sleep } from "@/lib/external/http";
import { istanbulCode, mostCommon } from "@/lib/external/pairs";
import type { ExternalDeal, SourceState } from "@/lib/external/types";
import { skyscannerPairs } from "@/lib/external/ucuzaucak";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";

export const SECRETFLYING_SOURCE = "secretflying";
/** Site genelinde bot koruması var; RSS / API / kategori sayfaları 403, arama sayfası açık. */
const SEARCH_URL = "https://www.secretflying.com/?s=istanbul";
const DETAIL_GAP_MS = 5_000;
const MAX_DETAILS_PER_RUN = 3;
/** Detay açılmazsa ilan bu kadar gün sonraki turlarda yeniden denenir, sonra liste bilgisiyle kaydedilir. */
const DETAIL_RETRY_DAYS = 2;

export type SecretFlyingCard = {
  id: string;
  url: string;
  title: string;
  postedOn: string | null;
  categories: string[];
};

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "Oct 7, 2026" → "2026-10-07" */
function cardDate(s: string | undefined) {
  const m = s?.match(/([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s*(\d{4})/);
  if (!m || !MONTHS[m[1]!]) return null;
  return `${m[3]}-${MONTHS[m[1]!]}-${m[2]!.padStart(2, "0")}`;
}

export function parseSecretFlyingCards(html: string): SecretFlyingCard[] {
  const cards: SecretFlyingCard[] = [];
  for (const block of html.split("<article ").slice(1)) {
    const cls = block.match(/^class="([^"]+)"/)?.[1] ?? "";
    const id = cls.match(/\bpost-(\d+)\b/)?.[1];
    const link = block.match(/class="title-link"[^>]*href="([^"]+)"[^>]*title="([^"]+)"/);
    if (!id || !link) continue;
    cards.push({
      id,
      url: link[1]!,
      title: decodeEntities(link[2]!).trim(),
      postedOn: cardDate(block.match(/<time[^>]*>([^<]+)<\/time>/)?.[1]),
      categories: cls
        .split(/\s+/)
        .filter((c) => c.startsWith("category-"))
        .map((c) => c.slice("category-".length)),
    });
  }
  return cards;
}

const CURRENCY_SYMBOL: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD" };

/** "for only €291 roundtrip" / "from only $552 CAD roundtrip" / "… one-way" */
export function parseSecretFlyingTitle(title: string) {
  const clean = title.replace(/^[^A-Za-z]+/, "").replace(/\s*\(&\s*vice versa\)/i, "");
  const route = clean.match(/^(?:.*?:\s*)?(?:ERROR FARE\s+)?(?:Non-stop from\s+|Business Class from\s+)?(.+?)\s+to\s+(.+?)\s+(?:for|from)\s+only\b/i);
  const price = clean.match(/only\s+([€£$])\s*(\d[\d,]*(?:\.\d+)?)(?:\s+(USD|CAD|AUD|NZD|SGD|HKD))?/i);
  return {
    from: route?.[1]?.trim() ?? null,
    to: route?.[2]?.trim() ?? null,
    viceVersa: /vice versa/i.test(title),
    price: price ? Number(price[2]!.replace(/,/g, "")) : null,
    currency: price ? (price[3]?.toUpperCase() ?? CURRENCY_SYMBOL[price[1]!]!) : null,
    tripType: /one[- ]way/i.test(title) ? ("ow" as const) : /round ?trip/i.test(title) ? ("rt" as const) : null,
  };
}

/** Kalkış İstanbul mu? Kategori `istanbul` = kalkış şehri (varış `_istanbul`). */
export function fromIstanbul(card: SecretFlyingCard) {
  if (card.categories.includes("istanbul")) return true;
  const t = parseSecretFlyingTitle(card.title);
  if (t.from && /istanbul/i.test(t.from)) return true;
  return t.viceVersa && !!t.to && /istanbul/i.test(t.to);
}

function stopsFrom(categories: string[]) {
  if (categories.includes("non-stop")) return 0;
  const n = categories.map((c) => c.match(/^(\d)-stops?$/)?.[1]).find(Boolean);
  return n ? Number(n) : null;
}

/** "DATES:" … sonraki büyük harfli etikete kadar. */
function detailField(text: string, label: string) {
  const m = text.match(new RegExp(`${label}:?\\s*\\n([\\s\\S]{0,600}?)(?:\\n[A-Z][A-Z &]{3,}:|$)`));
  return m?.[1]?.trim() || null;
}

export async function readSecretFlying(
  state: SourceState,
  isKnown: (ids: string[]) => Promise<Set<string>>,
): Promise<{ deals: ExternalDeal[]; note: string }> {
  const list = await politeFetch(SEARCH_URL, state);
  if (list.status === "blocked") return { deals: [], note: `engel ${list.code} → ${state.blockedUntil} kadar bekle` };
  if (list.status !== "ok") return { deals: [], note: list.status === "error" ? `hata: ${list.message}` : "değişiklik yok" };

  const cards = parseSecretFlyingCards(list.body);
  const ist = cards.filter(fromIstanbul);
  const known = await isKnown(ist.map((c) => c.id));
  const fresh = ist.filter((c) => !known.has(c.id));

  const detailState = (state.detail ??= {});
  const retryUntil = addDaysIso(turkeyTodayIso(), -DETAIL_RETRY_DAYS);
  const deals: ExternalDeal[] = [];
  let opened = 0;
  let waiting = 0;

  for (const card of fresh) {
    let detail: Awaited<ReturnType<typeof politeFetch>> | null = null;
    if (opened < MAX_DETAILS_PER_RUN && !isBlocked(detailState)) {
      if (opened > 0) await sleep(DETAIL_GAP_MS);
      opened++;
      detail = await politeFetch(card.url, detailState);
    }
    const body = detail?.status === "ok" ? detail.body : null;
    if (!body && card.postedOn && card.postedOn >= retryUntil) {
      waiting++;
      continue;
    }

    const t = parseSecretFlyingTitle(card.title);
    const text = body ? htmlToText(body) : "";
    const pairs = body
      ? skyscannerPairs(body)
          .filter((p) => istanbulCode(p.from))
          .map((p) => ({ ...p, from: istanbulCode(p.from)! }))
      : [];
    const destName = t.viceVersa && t.to && /istanbul/i.test(t.to) ? t.from : t.to;
    deals.push({
      source: SECRETFLYING_SOURCE,
      sourceId: card.id,
      url: card.url,
      title: card.title,
      publishedAt: card.postedOn ? `${card.postedOn}T00:00:00.000Z` : null,
      origin: mostCommon(pairs.map((p) => p.from)) ?? "IST",
      destCode: mostCommon(pairs.map((p) => p.to)),
      price: t.price,
      currency: t.currency,
      tripType: t.tripType,
      stops: stopsFrom(card.categories),
      datePairs: pairs,
      details: {
        destName,
        categories: card.categories,
        dates: body ? detailField(text, "DATES") : null,
        airlines: body ? detailField(text, "AIRLINES") : null,
        detailStatus: detail?.status ?? "skipped",
      },
    });
  }

  return {
    deals,
    note: `${cards.length} ilan, ${ist.length} İstanbul kalkışlı, ${fresh.length} yeni, ${opened} detay açıldı${waiting ? `, ${waiting} detay bekliyor` : ""}`,
  };
}
