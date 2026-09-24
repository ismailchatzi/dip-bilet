import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

/** İstekler arası bekleme — one-way oturumu yormamak için. */
export const SCRAPPA_REQUEST_GAP_MS = 2_000;

/** Rematch: bir RT adayı bittikten sonra sıradaki adaya geçiş. */
export const SCRAPPA_REMATCH_CANDIDATE_GAP_MS = 15_000;

/** Rematch: şehir başına önce bu kadar aday (fırsat skoruna göre). */
export const SCRAPPA_REMATCH_TOP_CANDIDATES = 3;

/** Rematch: top-N hepsi fail olursa yedek aday. */
export const SCRAPPA_REMATCH_RESERVE_CANDIDATES = 2;

/** Rematch: aynı tarih adayı için max RT transaction (her biri taze outbound+token). */
export const SCRAPPA_REMATCH_CANDIDATE_MAX_ATTEMPTS = 3;

/** 502 sonrası backoff (attempt 1/2/3 fail → sonraki deneme öncesi). */
export const SCRAPPA_REMATCH_502_BACKOFF_MS = [30_000, 90_000, 180_000] as const;

/** Defer edilen aday: bu kadar sonra aynı gün 1 kez daha. */
export const SCRAPPA_REMATCH_DEFER_MS = 75 * 60 * 1000;

/** Tek oturum hatası (cookie_session vb.): kısa nefes. */
export const SCRAPPA_SESSION_SOFT_PAUSE_MS = 15_000;

/** Düz 502/503 — rematch aday içi backoff yoksa üst katman kısa mola. */
export const SCRAPPA_TRANSIENT_PAUSE_MS = 90_000;

/**
 * Art arda bu kadar oturum hatası → uzun mola.
 * Rematch transient artık aday içinde tüketilir; bu daha çok one-way / oturum için.
 */
export const SCRAPPA_SESSION_CIRCUIT_AFTER = 7;

/** Circuit açıkken bekleme. */
export const SCRAPPA_SESSION_CIRCUIT_PAUSE_MS = 15 * 60 * 1000;

/**
 * One-way dilim bitince → RT rematch → booking arasında nefes (1–2 dk).
 * Rematch tick’te sleep yok: pausedUntil ile drain bekler.
 */
export const SCRAPPA_PHASE_BREATHER_MS = 90_000;

/** Full tarama: 28 şehir → 7 dilim × 4. */
export const FULL_CHUNK_SIZE = 4;
export const FULL_CHUNK_COUNT = Math.ceil(
  SCRAPPA_DESTINATIONS.length / FULL_CHUNK_SIZE,
);

export function fullChunkRange(chunk1based: number): {
  chunk: number;
  destStart: number;
  destLimit: number;
  codes: string[];
} {
  const chunk = Math.max(1, Math.min(FULL_CHUNK_COUNT, Math.floor(chunk1based)));
  const destStart = (chunk - 1) * FULL_CHUNK_SIZE;
  const destLimit = Math.min(
    destStart + FULL_CHUNK_SIZE,
    SCRAPPA_DESTINATIONS.length,
  );
  const codes = SCRAPPA_DESTINATIONS.slice(destStart, destLimit).map(
    (d) => d.code,
  );
  return { chunk, destStart, destLimit, codes };
}

/**
 * TR haftanın günü → tek full dilim (legacy / elle override).
 * Pzt=1 … Paz=7 (Europe/Istanbul).
 */
export function fullChunkForWeekday(now = new Date()): number {
  return fullChunksForWeekday(now)[0];
}

/**
 * TR haftanın günü → günde 2 full dilim (ikisi de B; arada rematch yok).
 * Pzt 1+2 · Sal 3+4 · Çar 5+6 · Per 7+1 · Cum 2+3 · Cmt 4+5 · Paz 6+7
 */
export function fullChunksForWeekday(now = new Date()): [number, number] {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  }).format(now);
  const pairs: Record<string, [number, number]> = {
    Mon: [1, 2],
    Tue: [3, 4],
    Wed: [5, 6],
    Thu: [7, 1],
    Fri: [2, 3],
    Sat: [4, 5],
    Sun: [6, 7],
  };
  return pairs[wd] ?? [1, 2];
}

/**
 * İki hesap, aynı kurallar, ayrı kilit.
 * A 05:00: near → rematch (o near yazımları). Full yok.
 * B 05:01: günün 1. full → 2. full → ikisinin rematch'i (o iki full yazımları).
 * 04:55 ikisini de keser.
 */
export const SCRAPPA_CRON_SCHEDULE = [
  { time: "05:00", cmd: "a start day" },
  { time: "05:01", cmd: "b start day" },
] as const;

/** crontab satırları (TZ=Europe/Istanbul, web/ kökü). */
export function scrappaCrontabLines(webDir = "/root/dip-bilet/web"): string[] {
  const bin = `cd ${webDir} && /usr/bin/npx tsx scripts/scrappa-worker.ts`;
  return [
    `55 4 * * * ${bin} cutoff >> /var/log/scrappa-a.log 2>&1`,
    // A ve B aynı dakikada değil: 05:00 ikisi birden npx kilidine takılıp B sessizce düşebiliyordu.
    `0 5 * * * ${bin} a start day >> /var/log/scrappa-a.log 2>&1`,
    `1 5 * * * ${bin} b start day >> /var/log/scrappa-b.log 2>&1`,
    // :00 ile start çakışmasın diye drain 1'den (1,5,9…)
    `1-59/4 * * * * ${bin} a drain >> /var/log/scrappa-a.log 2>&1`,
    `1-59/4 * * * * ${bin} b drain >> /var/log/scrappa-b.log 2>&1`,
  ];
}
