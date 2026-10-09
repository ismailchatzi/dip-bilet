import type { SourceState } from "@/lib/external/types";

const HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const BLOCK_BASE_MS = 60 * 60 * 1000;
const MAX_BACKOFF = 8;
const TIMEOUT_MS = 20_000;

export type PoliteResult =
  | { status: "ok"; body: string }
  | { status: "unchanged" }
  | { status: "blocked"; code: number }
  | { status: "error"; message: string };

export function isBlocked(state: SourceState, now = new Date()) {
  return !!state.blockedUntil && new Date(state.blockedUntil) > now;
}

/**
 * Kaynağı yormayan istek: ETag / Last-Modified ile koşullu (değişmediyse 304, içerik inmez).
 * 403/429 → kaynak 1 saat × backoff bekler, her tekrarında backoff 2 katı.
 */
export async function politeFetch(
  url: string,
  state: SourceState,
  opts: { conditional?: boolean } = {},
): Promise<PoliteResult> {
  const headers = { ...HEADERS };
  if (opts.conditional) {
    if (state.etag) headers["if-none-match"] = state.etag;
    if (state.lastModified) headers["if-modified-since"] = state.lastModified;
  }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 304) return { status: "unchanged" };
    if (res.status === 403 || res.status === 429) {
      const backoff = Math.min((state.backoff ?? 1) * 2, MAX_BACKOFF);
      state.backoff = backoff;
      state.blockedUntil = new Date(Date.now() + BLOCK_BASE_MS * (backoff / 2)).toISOString();
      return { status: "blocked", code: res.status };
    }
    if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
    const body = await res.text();
    state.backoff = 1;
    delete state.blockedUntil;
    if (opts.conditional) {
      const etag = res.headers.get("etag");
      const lastModified = res.headers.get("last-modified");
      if (etag) state.etag = etag;
      if (lastModified) state.lastModified = lastModified;
    }
    return { status: "ok", body };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Akışı bir sonraki turda baştan okut (yarım kalan / kaydedilemeyen ilanlar 304'te kaybolmasın). */
export function forgetFeedVersion(state: SourceState) {
  delete state.etag;
  delete state.lastModified;
  delete state.lastPost;
}

export function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&#8212;/g, "–")
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export type RssItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: string | null;
  content: string;
};

export function parseRssItems(xml: string): RssItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1]!;
    const tag = (name: string) =>
      it.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
    const link = decodeEntities(tag("link")).trim();
    const pub = tag("pubDate").trim();
    return {
      title: decodeEntities(tag("title")).trim(),
      link,
      guid: decodeEntities(tag("guid")).trim() || link,
      pubDate: pub ? new Date(pub).toISOString() : null,
      content: decodeEntities(tag("content:encoded") || tag("description")),
    };
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
