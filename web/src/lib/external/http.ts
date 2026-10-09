import { execFile } from "node:child_process";
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

const STATUS_MARK = "\n__HTTP_STATUS__";

/** Cloudflare bazı sitelerde Node'un TLS imzasını 403'lüyor, curl'ü geçiriyor (Secret Flying detay). */
function curlGet(url: string): Promise<{ status: number; body: string }> {
  const args = [
    "-s",
    "--compressed",
    "--max-time",
    String(TIMEOUT_MS / 1000),
    "-A",
    HEADERS["user-agent"]!,
    "-H",
    "Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8",
    "-w",
    `${STATUS_MARK}%{http_code}`,
    url,
  ];
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      const i = stdout.lastIndexOf(STATUS_MARK);
      if (i < 0) return reject(new Error("curl: durum kodu yok"));
      resolve({ status: Number(stdout.slice(i + STATUS_MARK.length).trim()), body: stdout.slice(0, i) });
    });
  });
}

function markBlocked(state: SourceState, code: number): PoliteResult {
  const backoff = Math.min((state.backoff ?? 1) * 2, MAX_BACKOFF);
  state.backoff = backoff;
  state.blockedUntil = new Date(Date.now() + BLOCK_BASE_MS * (backoff / 2)).toISOString();
  return { status: "blocked", code };
}

function markOk(state: SourceState) {
  state.backoff = 1;
  delete state.blockedUntil;
}

/**
 * Kaynağı yormayan istek: ETag / Last-Modified ile koşullu (değişmediyse 304, içerik inmez).
 * 403/429 → kaynak 1 saat × backoff bekler, her tekrarında backoff 2 katı.
 */
export async function politeFetch(
  url: string,
  state: SourceState,
  opts: { conditional?: boolean; via?: "curl" } = {},
): Promise<PoliteResult> {
  if (opts.via === "curl") {
    try {
      const res = await curlGet(url);
      if (res.status === 403 || res.status === 429) return markBlocked(state, res.status);
      if (res.status < 200 || res.status >= 300) return { status: "error", message: `HTTP ${res.status}` };
      markOk(state);
      return { status: "ok", body: res.body };
    } catch (e) {
      return { status: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  const headers = { ...HEADERS };
  if (opts.conditional) {
    if (state.etag) headers["if-none-match"] = state.etag;
    if (state.lastModified) headers["if-modified-since"] = state.lastModified;
  }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 304) return { status: "unchanged" };
    if (res.status === 403 || res.status === 429) return markBlocked(state, res.status);
    if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
    const body = await res.text();
    markOk(state);
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
