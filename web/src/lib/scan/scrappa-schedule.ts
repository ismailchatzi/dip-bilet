import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

/** İstekler arası bekleme — oturumu yormamak için. */
export const SCRAPPA_REQUEST_GAP_MS = 2_000;

/** cookie_session / request_exhausted: kısa spam yerine uzun nefes. */
export const SCRAPPA_SESSION_PAUSE_MS = 45 * 60 * 1000;

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
 * TR takvim (TZ=Europe/Istanbul) — günlük hacim aynı, 24saate yayılmış.
 * Full dilim ~65dk / near ~50dk @ 2sn gap; start aralığı 2.5sa → çakışmaz.
 */
export const SCRAPPA_CRON_SCHEDULE = [
  { time: "00:00", cmd: "start full 1" },
  { time: "02:30", cmd: "start full 2" },
  { time: "05:00", cmd: "start full 3" },
  { time: "07:30", cmd: "start full 4" },
  { time: "10:00", cmd: "start full 5" },
  { time: "12:30", cmd: "start near" },
  { time: "13:30", cmd: "rematch" },
  { time: "15:00", cmd: "start full 6" },
  { time: "17:30", cmd: "start full 7" },
  { time: "20:00", cmd: "start near" },
  { time: "22:30", cmd: "rematch" },
] as const;
