import { htmlToText, politeFetch, sleep } from "@/lib/external/http";
import { cleanPairs } from "@/lib/external/pairs";
import type { ExternalDeal, SourceState } from "@/lib/external/types";

/** Kaynak adı kanal değil "telegram": 7. adımdaki anlık okuma aynı sourceId'yi (kanal/no) üretir → tek kayıt. */
export const TELEGRAM_SOURCE = "telegram";
const CHANNELS = ["ucuzaseyahat"];
const PAGE_GAP_MS = 3_000;
/** Toplayıcı uzun süre durduysa en fazla bu kadar sayfa (20'şer mesaj) geriye gidilir. */
const MAX_PAGES = 5;

/** Türkçe karakter / alt çizgi farkı olmadan karşılaştırma. */
export function foldTr(s: string) {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[_-]+/g, " ")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/[öó]/g, "o")
    .replace(/[üú]/g, "u")
    .replace(/[âáà]/g, "a")
    .replace(/[éè]/g, "e")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kanal hashtag'i (Türkçe şehir) → IATA. Birden çok havalimanlı şehirde vitrindeki şehir kodu
 * (Paris CDG, Milano MXP, Londra LTN). Belirsiz olanlar (Karadağ, Tokyo) bilerek yok → yalnız ad saklanır.
 */
const CITY_CODES: Record<string, string> = {
  atina: "ATH", prag: "PRG", viyana: "VIE", "sarm el seyh": "SSH", budapeste: "BUD",
  rotterdam: "RTM", dublin: "DUB", berlin: "BER", selanik: "SKG", paris: "CDG", nice: "NCE",
  barselona: "BCN", valensiya: "VLC", sevilla: "SVQ", hurgada: "HRG", guangzhou: "CAN",
  krakow: "KRK", palermo: "PMO", amsterdam: "AMS", stokholm: "ARN", hamburg: "HAM",
  bilbao: "BIO", nuremberg: "NUE", nurnberg: "NUE", basel: "BSL", pekin: "PEK", bruksel: "BRU",
  varsova: "WAW", kahire: "CAI", tiflis: "TBS", ljubljana: "LJU", helsinki: "HEL",
  londra: "LTN", milano: "MXP", roma: "FCO", venedik: "VCE", munih: "MUC", frankfurt: "FRA",
  madrid: "MAD", lizbon: "LIS", napoli: "NAP", bologna: "BLQ", sofya: "SOF", belgrad: "BEG",
  saraybosna: "SJJ", uskup: "SKP", tiran: "TIA", baku: "GYD", dubai: "DXB", bangkok: "BKK",
  phuket: "HKT", bali: "DPS", maldivler: "MLE", kopenhag: "CPH", oslo: "OSL", zurih: "ZRH",
  cenevre: "GVA", malta: "MLA", larnaka: "LCA", batum: "BUS", kutaisi: "KUT", erivan: "EVN",
  amman: "AMM", beyrut: "BEY", doha: "DOH", "abu dabi": "AUH", marakes: "RAK",
  kazablanka: "CMN", tunus: "TUN", porto: "OPO", malaga: "AGP", dusseldorf: "DUS",
  koln: "CGN", stuttgart: "STR", bratislava: "BTS", bukres: "OTP", kisinev: "RMO",
  riga: "RIX", tallinn: "TLL", vilnius: "VNO", edinburgh: "EDI", manchester: "MAN",
  birmingham: "BHX", eindhoven: "EIN", bremen: "BRE", hannover: "HAJ", dortmund: "DTM",
  lyon: "LYS", marsilya: "MRS", alicante: "ALC", "palma de mallorca": "PMI", katanya: "CTA",
  bari: "BRI", pisa: "PSA", floransa: "FLR", torino: "TRN", gdansk: "GDN", varna: "VAR",
  podgorica: "TGD", tivat: "TIV", pristine: "PRN", ohrid: "OHD",
  "kuala lumpur": "KUL", singapur: "SIN", seul: "ICN", "hong kong": "HKG", sanghay: "PVG",
  "new york": "JFK", toronto: "YYZ", cidde: "JED", riyad: "RUH", medine: "MED",
  "sri lanka": "CMB", kolombo: "CMB", nairobi: "NBO", zanzibar: "ZNZ", tahran: "IKA",
};

export function cityCode(name: string) {
  return CITY_CODES[foldTr(name)] ?? null;
}

const MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};

/** "27 KASIM" → ISO; yıl yok → mesaj gününden (1 haftadan eski görünüyorsa) sonraki yıl. */
function dayMonth(day: string, month: string, postedIso: string) {
  const m = MONTHS[foldTr(month)];
  if (!m) return null;
  const posted = new Date(postedIso);
  let year = posted.getUTCFullYear();
  const iso = (y: number) => `${y}-${String(m).padStart(2, "0")}-${day.padStart(2, "0")}`;
  const weekAgo = new Date(posted.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  if (iso(year) < weekAgo) year++;
  return iso(year);
}

export type UcuzaseyahatPost = {
  origin: "IST" | "SAW" | null;
  destName: string | null;
  destCode: string | null;
  priceTry: number | null;
  priceUsd: number | null;
  nights: number | null;
  out: string | null;
  ret: string | null;
  rating: string | null;
};

/**
 * 💚 ÇOK İYİ
 * 💰 6348₺ ~$129 💵 = 49.22₺
 * ✈️ Sabiha Gökçen · 2 gece
 * 27 KASIM Cuma → 29 KASIM Pazar
 * #KARADAĞ #KARADAĞ
 */
export function parseUcuzaseyahat(text: string, postedIso: string): UcuzaseyahatPost {
  const price = text.match(/💰\s*([\d.,]+)\s*₺\s*~\s*\$\s*([\d.,]+)/);
  const air = text.match(/✈️\s*([^·\n]+?)\s*·\s*(\d+)\s*gece/i);
  const datesLine = text.split("\n").find((l) => /^\s*\d{1,2}\s+[A-ZÇĞİÖŞÜ]{3,}/.test(l)) ?? "";
  const d = datesLine.match(/(\d{1,2})\s+([^\s]+)[^→]*(?:→\s*(\d{1,2})\s+([^\s]+))?/);
  const tag = text.match(/(?:^|\n)\s*#([^\s#]+)/)?.[1] ?? null;
  const destName = tag ? tag.replace(/_/g, " ") : null;
  const airport = air?.[1] ? foldTr(air[1]) : "";
  const out = d ? dayMonth(d[1]!, d[2]!, postedIso) : null;
  let ret = d?.[3] && d[4] ? dayMonth(d[3], d[4], postedIso) : null;
  if (out && ret && ret < out) ret = `${Number(ret.slice(0, 4)) + 1}${ret.slice(4)}`;
  return {
    origin: airport.includes("sabiha") ? "SAW" : airport.includes("istanbul") ? "IST" : null,
    destName,
    destCode: destName ? cityCode(destName) : null,
    priceTry: price ? Number(price[1]!.replace(/[.,]/g, "")) : null,
    priceUsd: price ? Number(price[2]!.replace(/,/g, "")) : null,
    nights: air?.[2] ? Number(air[2]) : null,
    out,
    ret,
    rating: text.split("\n")[0]?.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]+/, "").trim() || null,
  };
}

type TgMessage = { channel: string; id: number; postedAt: string; text: string };

export function parseTelegramPage(html: string): TgMessage[] {
  const out: TgMessage[] = [];
  for (const block of html.split('class="tgme_widget_message_wrap').slice(1)) {
    const post = block.match(/data-post="([^/"]+)\/(\d+)"/);
    const time = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    const textHtml = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!post || !time || !textHtml) continue;
    out.push({
      channel: post[1]!,
      id: Number(post[2]),
      postedAt: new Date(time).toISOString(),
      text: htmlToText(textHtml),
    });
  }
  return out;
}

function ucuzaseyahatDeal(m: TgMessage): ExternalDeal | null {
  if (!/💰/.test(m.text)) return null;
  const p = parseUcuzaseyahat(m.text, m.postedAt);
  const pairs =
    p.origin && p.destCode && p.out
      ? cleanPairs([{ from: p.origin, to: p.destCode, out: p.out, ret: p.ret }])
      : [];
  return {
    source: TELEGRAM_SOURCE,
    sourceId: `${m.channel}/${m.id}`,
    url: `https://t.me/${m.channel}/${m.id}`,
    title: m.text.split("\n").find((l, i) => i > 0 && l.trim())?.trim() ?? m.text.slice(0, 120),
    publishedAt: m.postedAt,
    origin: p.origin,
    destCode: p.destCode,
    price: p.priceUsd,
    currency: p.priceUsd != null ? "USD" : null,
    tripType: p.ret ? "rt" : p.out ? "ow" : null,
    stops: null,
    datePairs: pairs,
    details: {
      channel: m.channel,
      destName: p.destName,
      priceTry: p.priceTry,
      nights: p.nights,
      out: p.out,
      ret: p.ret,
      rating: p.rating,
      summary: m.text.slice(0, 600),
    },
  };
}

const PARSERS: Record<string, (m: TgMessage) => ExternalDeal | null> = {
  ucuzaseyahat: ucuzaseyahatDeal,
};

/**
 * Kanalın herkese açık önizlemesi (t.me/s/<kanal>, son 20 mesaj).
 * Son okunan mesajdan bu yana 20'den fazla mesaj varsa geriye doğru sayfa sayfa (en fazla MAX_PAGES).
 */
export async function readTelegram(
  state: SourceState,
  isKnown: (ids: string[]) => Promise<Set<string>>,
): Promise<{ deals: ExternalDeal[]; note: string }> {
  const lastPost = (state.lastPost ??= {});
  const deals: ExternalDeal[] = [];
  const notes: string[] = [];

  for (const channel of CHANNELS) {
    const parse = PARSERS[channel]!;
    const seen = lastPost[channel] ?? 0;
    const messages: TgMessage[] = [];
    let before: number | null = null;
    let pages = 0;
    let failed: string | null = null;

    while (pages < MAX_PAGES) {
      if (pages > 0) await sleep(PAGE_GAP_MS);
      pages++;
      const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
      const res = await politeFetch(url, state);
      if (res.status !== "ok") {
        failed = res.status === "blocked" ? `engel ${res.code}` : res.status === "error" ? res.message : res.status;
        break;
      }
      const page = parseTelegramPage(res.body).filter((m) => m.channel === channel);
      if (!page.length) break;
      messages.push(...page);
      const oldest = Math.min(...page.map((m) => m.id));
      if (!seen || oldest <= seen + 1) break;
      before = oldest;
    }

    const fresh = messages.filter((m) => m.id > seen);
    const parsed = fresh.map(parse).filter((d): d is ExternalDeal => d != null);
    const known = await isKnown(parsed.map((d) => d.sourceId));
    const newDeals = parsed.filter((d) => !known.has(d.sourceId));
    deals.push(...newDeals);
    if (!failed && messages.length) lastPost[channel] = Math.max(seen, ...messages.map((m) => m.id));
    notes.push(
      `${channel}: ${messages.length} mesaj (${pages} sayfa), ${fresh.length} okunmamış, ${newDeals.length} yeni ilan${failed ? `, hata: ${failed}` : ""}`,
    );
  }

  return { deals, note: notes.join(" · ") };
}
