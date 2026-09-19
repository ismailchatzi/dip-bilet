import {
  SCRAPPA_DESTINATIONS,
  SCRAPPA_ORIGINS,
} from "@/lib/scan/scrappa-targets";

export type ScrappaWindow = "full" | "near";

export type ScrappaLeg = {
  origin: string;
  destination: string;
  destName: string;
};

function isoFromOffset(days: number, now = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  );
  return d.toISOString().slice(0, 10);
}

/**
 * Gün 1–4 atlanır (offset 0–3).
 * near: gün 5–21 (offset 4–20), günde 3×
 * full: gün 22–180 (offset 21–179), günde 1× — near dilimini tekrarlamaz
 */
export function horizonDates(window: ScrappaWindow, now = new Date()): string[] {
  const start = window === "near" ? 4 : 21;
  const end = window === "near" ? 20 : 179;
  const dates: string[] = [];
  for (let i = start; i <= end; i++) dates.push(isoFromOffset(i, now));
  return dates;
}

export function legsForDest(destCode: string, destName: string): ScrappaLeg[] {
  return [
    { origin: "IST", destination: destCode, destName },
    { origin: "SAW", destination: destCode, destName },
    { origin: destCode, destination: "IST", destName },
    { origin: destCode, destination: "SAW", destName },
  ];
}

export function allDestinations() {
  return SCRAPPA_DESTINATIONS;
}

/** Rematch’in one-way gözlem süzgeci (tarihçe değil, o tarama yazımları). */
export type ScrappaObsWindow = {
  observedAtGte: string;
  observedAtLt?: string;
  outboundDateGte: string;
  outboundDateLte: string;
};

/** Tek one-way job → rematch obs penceresi. */
export function obsWindowForOneWayJob(job: {
  window: ScrappaWindow;
  startedAt: string;
}): ScrappaObsWindow {
  const dates = horizonDates(job.window, new Date(job.startedAt));
  return {
    observedAtGte: job.startedAt,
    outboundDateGte: dates[0]!,
    outboundDateLte: dates[dates.length - 1]!,
  };
}

/** A + B full job’ları → birleşik obs penceresi (erken başlayan startedAt). */
export function obsWindowForFullPair(
  aJob: { startedAt: string },
  bJob: { startedAt: string } | null | undefined,
): ScrappaObsWindow {
  const startedAt =
    bJob?.startedAt && bJob.startedAt < aJob.startedAt
      ? bJob.startedAt
      : aJob.startedAt;
  return obsWindowForOneWayJob({ window: "full", startedAt });
}

/** Elle rematch: yalnız bugün TR 00:00’dan itibaren yazılanlar. */
export function obsObservedAtGteTodayTr(now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

export { SCRAPPA_ORIGINS };
