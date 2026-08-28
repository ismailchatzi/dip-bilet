import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

/** İstekler arası bekleme — oturumu yormamak için. */
export const SCRAPPA_REQUEST_GAP_MS = 2_000;

/** Tek oturum/503 hatası: kısa nefes, taramayı öldürme. */
export const SCRAPPA_SESSION_SOFT_PAUSE_MS = 15_000;

/**
 * Art arda bu kadar cookie_session / request_exhausted → uzun mola.
 * Sonra kaldığı yerden devam.
 */
export const SCRAPPA_SESSION_CIRCUIT_AFTER = 7;

/** Circuit açıkken bekleme — sonra kaldığı cursor’dan devam. */
export const SCRAPPA_SESSION_CIRCUIT_PAUSE_MS = 5 * 60 * 1000;

/**
 * One-way dilim bitince → RT rematch → booking arasında nefes (1–2 dk).
 */
export const SCRAPPA_PHASE_BREATHER_MS = 90_000;

/** Full tarama: 21 şehir → 7 dilim × 3. */
export const FULL_CHUNK_SIZE = 3;
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
 * TR haftanın günü → günde 2 full dilim (arka arkaya; arada rematch yok).
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
 * TR takvim — near + 2 full dilim (arka arkaya) + gün sonu rematch.
 * 05:00: start day → near → rematch → full A → full B → rematch
 * 22:30: güvenlik rematch
 */
export const SCRAPPA_CRON_SCHEDULE = [
  { time: "05:00", cmd: "start day" },
  { time: "22:30", cmd: "rematch" },
] as const;

/** crontab satırları (TZ=Europe/Istanbul, web/ kökü). */
export function scrappaCrontabLines(webDir = "/root/dip-bilet/web"): string[] {
  const bin = `cd ${webDir} && /usr/bin/npx tsx scripts/scrappa-worker.ts`;
  return [
    `0 5 * * * ${bin} start day >> /var/log/scrappa.log 2>&1`,
    `30 22 * * * ${bin} rematch >> /var/log/scrappa.log 2>&1`,
    `*/4 * * * * ${bin} drain >> /var/log/scrappa.log 2>&1`,
  ];
}
