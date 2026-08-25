import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

/** İstekler arası bekleme — oturumu yormamak için. */
export const SCRAPPA_REQUEST_GAP_MS = 2_000;

/** Tek oturum/503 hatası: kısa nefes, taramayı öldürme. */
export const SCRAPPA_SESSION_SOFT_PAUSE_MS = 15_000;

/**
 * Art arda bu kadar cookie_session / request_exhausted → uzun mola.
 * (Tek 503'te 45 dk beklemek dilimi bitirmez.)
 */
export const SCRAPPA_SESSION_CIRCUIT_AFTER = 7;

/** Circuit açıkken bekleme — sonra 1 deneme; yine fail → yine bu süre. */
export const SCRAPPA_SESSION_CIRCUIT_PAUSE_MS = 20 * 60 * 1000;

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
 * TR haftanın günü → full dilim.
 * Pzt=1 … Paz=7 (Europe/Istanbul).
 */
export function fullChunkForWeekday(now = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] ?? 1;
}

/**
 * TR takvim — tek near + o günün full dilimi (zincir tick içinde).
 * 07:00: start day → near → rematch → full N → rematch
 * 22:30: güvenlik rematch
 */
export const SCRAPPA_CRON_SCHEDULE = [
  { time: "07:00", cmd: "start day" },
  { time: "22:30", cmd: "rematch" },
] as const;

/** crontab satırları (TZ=Europe/Istanbul, web/ kökü). */
export function scrappaCrontabLines(webDir = "/root/dip-bilet/web"): string[] {
  const bin = `cd ${webDir} && /usr/bin/npx tsx scripts/scrappa-worker.ts`;
  return [
    `0 7 * * * ${bin} start day >> /var/log/scrappa.log 2>&1`,
    `30 22 * * * ${bin} rematch >> /var/log/scrappa.log 2>&1`,
    `*/5 * * * * ${bin} drain >> /var/log/scrappa.log 2>&1`,
  ];
}
