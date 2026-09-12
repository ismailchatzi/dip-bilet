/**
 * Rematch + booking — one-way gibi kaldığı yerden (cron drain her 4 dk).
 * Oturum/502 kopunca pause; cron devam eder. Abort = bitiş değil.
 */
import { notifyNewDeals } from "@/lib/notify-new-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import { isUnverifiedOneWaySum } from "@/lib/deal-display";
import {
  applyBookingToDeal,
  cardFromPending,
  destCodeFromDeal,
  foldAutoAndManual,
  isGoogleDeal,
  isManualDeal,
  matchDestFromDb,
  type RtPending,
} from "@/lib/scan/scrappa-match";
import { jobFromPayload, normalizeQueue } from "@/lib/scan/scrappa-job";
import {
  SCRAPPA_PHASE_BREATHER_MS,
  SCRAPPA_SESSION_CIRCUIT_AFTER,
  SCRAPPA_SESSION_CIRCUIT_PAUSE_MS,
  SCRAPPA_SESSION_SOFT_PAUSE_MS,
} from "@/lib/scan/scrappa-schedule";
import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";
import { currentLane } from "@/lib/scan/scrappa-lane";
import { ScrappaUnavailableError } from "@/lib/providers/scrappa";
import type {
  Deal,
  DealsPayload,
  ScrappaQueueItem,
  ScrappaRematchJob,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function rematchJobFromPayload(
  deals: DealsPayload | null | undefined,
): ScrappaRematchJob | null {
  if (!deals) return null;
  return currentLane() === "b"
    ? (deals.scrappaRematchJobB ?? null)
    : (deals.scrappaRematchJob ?? null);
}

function rematchDestList(job: ScrappaRematchJob) {
  const allow = job.destCodes?.filter(Boolean);
  if (!allow?.length) return SCRAPPA_DESTINATIONS;
  const set = new Set(allow);
  return SCRAPPA_DESTINATIONS.filter((d) => set.has(d.code));
}

export function isRematchJobFresh(
  job: ScrappaRematchJob | null,
  maxAgeMs = 20 * 1000,
) {
  if (!job || job.status !== "running") return false;
  if (job.pausedUntil && Date.parse(job.pausedUntil) > Date.now()) return true;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}

export function isRematchJobStale(
  job: ScrappaRematchJob | null,
  maxAgeMs = 15 * 60 * 1000,
) {
  if (!job || job.status !== "running") return true;
  if (job.pausedUntil && Date.parse(job.pausedUntil) > Date.now()) return false;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > maxAgeMs;
}

function isSessionOutageMessage(msg?: string) {
  return Boolean(
    msg &&
      /cookie_session|request_exhausted|\b502\b|\b503\b|oturum|unavailable|API key|validating/i.test(
        msg,
      ),
  );
}

export async function saveRematchJob(
  admin: SupabaseClient,
  job: ScrappaRematchJob | null,
) {
  const board = await readScanBoard(admin);
  const deals = board.deals;
  if (!deals) {
    return patchScanBoard(admin, {
      deals: {
        source: "cache",
        fetchedAt: new Date().toISOString(),
        departure: "İstanbul (IST / SAW)",
        deals: [],
        archive: [],
        scrappaRematchJob: job ?? undefined,
        scrappaRematchJobB: undefined,
      },
    });
  }
  const lane = currentLane();
  return patchScanBoard(admin, {
    deals:
      lane === "b"
        ? { ...deals, scrappaRematchJobB: job ?? undefined }
        : { ...deals, scrappaRematchJob: job ?? undefined },
  });
}

function pendingRecord(
  job: ScrappaRematchJob,
): NonNullable<ScrappaRematchJob["pendingByDest"]> {
  return { ...(job.pendingByDest ?? {}) };
}

function pendingList(
  job: ScrappaRematchJob,
  code: string,
): RtPending[] {
  return pendingRecord(job)[code] ?? [];
}

/** Vitrin: tamamlanan şehirler + henüz işlenmeyenlerde önceki Scrappa kartı. */
function buildScrappaCards(
  job: ScrappaRematchJob,
  previous: Deal[],
): Deal[] {
  const cards: Deal[] = [];
  const doneCodes = new Set<string>();
  const cities = rematchDestList(job);
  const scoped = new Set(cities.map((d) => d.code));

  if (job.phase === "rt") {
    for (let i = 0; i < job.destIndex; i++) {
      const code = cities[i]?.code;
      if (!code) continue;
      const pending = pendingList(job, code);
      if (pending.length === 0) continue;
      const c = cardFromPending(pending);
      if (c) {
        cards.push(c);
        doneCodes.add(code);
      }
    }
    for (let i = job.destIndex; i < cities.length; i++) {
      const code = cities[i]!.code;
      if (doneCodes.has(code)) continue;
      for (const deal of previous) {
        if (
          !isGoogleDeal(deal) &&
          !isManualDeal(deal) &&
          destCodeFromDeal(deal) === code
        ) {
          cards.push(deal);
          doneCodes.add(code);
          break;
        }
      }
    }
    for (const deal of previous) {
      const code = destCodeFromDeal(deal);
      if (!code || scoped.has(code) || doneCodes.has(code)) continue;
      if (isGoogleDeal(deal) || isManualDeal(deal)) continue;
      cards.push(deal);
      doneCodes.add(code);
    }
    return cards;
  }

  // booking: RT’den gelen tüm pending (doğrulanmış veya liste fiyatı)
  for (const dest of cities) {
    const pending = pendingList(job, dest.code);
    if (pending.length === 0) continue;
    const c = cardFromPending(pending);
    if (c) {
      cards.push(c);
      doneCodes.add(dest.code);
    }
  }
  for (const deal of previous) {
    const code = destCodeFromDeal(deal);
    if (!code || scoped.has(code) || doneCodes.has(code)) continue;
    if (isGoogleDeal(deal) || isManualDeal(deal)) continue;
    cards.push(deal);
    doneCodes.add(code);
  }
  return cards;
}

async function foldRematchProgress(
  admin: SupabaseClient,
  job: ScrappaRematchJob,
  opts?: { notify?: boolean },
): Promise<{ ok: boolean; count: number; error?: string; live: Deal[] }> {
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const googleKept = previous.filter(isGoogleDeal);
  const manualKept = previous.filter(isManualDeal);
  const scrappaCards = buildScrappaCards(job, previous);
  const collapsed = foldAutoAndManual(
    board.deals?.deals,
    scrappaCards,
    googleKept,
    manualKept,
  ).filter((d) => !isUnverifiedOneWaySum(d));
  const { payload, live, previousLive } = foldShowcase(board.deals, collapsed);
  const saved = await patchScanBoard(admin, {
    deals:
      currentLane() === "b"
        ? { ...payload, scrappaRematchJobB: job }
        : { ...payload, scrappaRematchJob: job },
  });
  if (!saved.ok) return { ok: false, count: 0, error: saved.error, live: [] };
  if (opts?.notify) {
    await notifyNewDeals(admin, previousLive, live);
  }
  return { ok: true, count: live.length, live };
}

function pauseJob(
  job: ScrappaRematchJob,
  lastError: string,
): ScrappaRematchJob {
  const now = new Date().toISOString();
  const sessionOutage = isSessionOutageMessage(lastError);
  const sessionFailStreak = sessionOutage
    ? (job.sessionFailStreak ?? 0) + 1
    : 0;
  const pauseMs =
    sessionOutage && sessionFailStreak >= SCRAPPA_SESSION_CIRCUIT_AFTER
      ? SCRAPPA_SESSION_CIRCUIT_PAUSE_MS
      : SCRAPPA_SESSION_SOFT_PAUSE_MS;
  return {
    ...job,
    heartbeatAt: now,
    lastError,
    sessionFailStreak,
    pausedUntil: new Date(Date.now() + pauseMs).toISOString(),
  };
}

/**
 * Yeni rematch işi veya force ile sıfırdan.
 * Canlı rematch varken force yoksa skip.
 */
export async function startRematchJob(
  admin: SupabaseClient,
  opts?: {
    force?: boolean;
    notify?: boolean;
    skipBreather?: boolean;
    continueQueue?: ScrappaQueueItem[];
    destCodes?: string[];
    partnerChunk?: number;
  },
): Promise<{
  ok: boolean;
  skipped?: string;
  job?: ScrappaRematchJob;
}> {
  const board = await readScanBoard(admin);
  const current = rematchJobFromPayload(board.deals);
  const oneWay = jobFromPayload(board.deals);
  const now = new Date().toISOString();

  if (
    oneWay?.status === "running" &&
    !oneWay.halted &&
    !opts?.force
  ) {
    const t = Date.parse(oneWay.heartbeatAt);
    const fresh =
      Number.isFinite(t) && Date.now() - t <= 15 * 60 * 1000;
    if (fresh) {
      return { ok: false, skipped: "tarama sürüyor", job: current ?? undefined };
    }
  }

  if (
    current?.status === "running" &&
    !opts?.force &&
    !isRematchJobStale(current)
  ) {
    return { ok: false, skipped: "rematch sürüyor", job: current };
  }

  const job: ScrappaRematchJob = {
    status: "running",
    phase: "rt",
    destIndex: 0,
    bookingItemIndex: 0,
    heartbeatAt: now,
    startedAt: now,
    pausedUntil: undefined,
    sessionFailStreak: 0,
    lastError: undefined,
    continueQueue: normalizeQueue(opts?.continueQueue ?? []),
    notify: opts?.notify !== false,
    rtBreatherDone: opts?.skipBreather === true,
    bookingBreatherDone: false,
    pendingByDest: {},
    destCodes: opts?.destCodes,
    partnerChunk: opts?.partnerChunk,
  };
  await saveRematchJob(admin, job);
  console.log("rematch: job başladı (RT fazı, drain ile devam)");
  return { ok: true, job };
}

/**
 * Tek adım: bir şehir RT veya booking paket(ler)i.
 * Drain / tick her çağrıda bir adım ilerler.
 */
export async function runRematchTick(
  admin: SupabaseClient,
  opts?: { force?: boolean },
): Promise<{
  ok: boolean;
  running: boolean;
  paused?: boolean;
  skipped?: string;
  phase?: "rt" | "booking";
  dest?: string;
  count?: number;
  lastError?: string;
  pausedUntil?: string;
  finished?: boolean;
  continueQueue?: ScrappaQueueItem[];
  partnerChunk?: number;
}> {
  const board = await readScanBoard(admin);
  let job = rematchJobFromPayload(board.deals);
  if (!job || job.status !== "running") {
    return { ok: true, running: false, skipped: "rematch yok" };
  }

  const pausedUntil = job.pausedUntil ? Date.parse(job.pausedUntil) : 0;
  if (Number.isFinite(pausedUntil) && pausedUntil > Date.now()) {
    return {
      ok: true,
      running: true,
      paused: true,
      skipped: job.lastError || "Scrappa bekleniyor",
      pausedUntil: job.pausedUntil,
      phase: job.phase,
    };
  }

  if (!opts?.force && isRematchJobFresh(job)) {
    return {
      ok: true,
      running: true,
      skipped: "dilim çalışıyor",
      phase: job.phase,
    };
  }

  // RT nefes (yalnız faz başı) — sleep yerine pause (drain */4 devam eder)
  if (job.phase === "rt" && !job.rtBreatherDone) {
    const until = new Date(Date.now() + SCRAPPA_PHASE_BREATHER_MS).toISOString();
    console.log(
      `rematch: one-way sonrası ${SCRAPPA_PHASE_BREATHER_MS / 1000}s nefes`,
    );
    job = {
      ...job,
      rtBreatherDone: true,
      heartbeatAt: new Date().toISOString(),
      pausedUntil: until,
      lastError: "faz nefes",
    };
    await saveRematchJob(admin, job);
    return {
      ok: true,
      running: true,
      paused: true,
      skipped: "faz nefes",
      pausedUntil: until,
      phase: "rt",
    };
  }

  if (job.phase === "rt") {
    if (job.destIndex >= rematchDestList(job).length) {
      job = {
        ...job,
        phase: "booking",
        destIndex: 0,
        bookingItemIndex: 0,
        bookingBreatherDone: false,
        heartbeatAt: new Date().toISOString(),
        lastError: undefined,
        sessionFailStreak: 0,
        pausedUntil: undefined,
      };
      await saveRematchJob(admin, job);
      console.log("rematch: RT bitti → booking fazı");
      return {
        ok: true,
        running: true,
        phase: "booking",
        skipped: "faz geçişi",
      };
    }

    const dest = rematchDestList(job)[job.destIndex]!;
    try {
      console.log(`rematch RT ${dest.code}`);
      const matched = await matchDestFromDb(admin, dest, { withBooking: false });
      console.log(`rematch RT ${dest.code} scrappa=${matched.card ? 1 : 0}`);
      const pending = pendingRecord(job);
      if (matched.pending.length > 0) {
        pending[dest.code] = matched.pending;
      } else {
        delete pending[dest.code];
      }
      job = {
        ...job,
        destIndex: job.destIndex + 1,
        pendingByDest: pending,
        heartbeatAt: new Date().toISOString(),
        lastError: undefined,
        sessionFailStreak: 0,
        pausedUntil: undefined,
      };
      await saveRematchJob(admin, job);
      await foldRematchProgress(admin, job, { notify: true });
      return {
        ok: true,
        running: true,
        phase: "rt",
        dest: dest.code,
        count: matched.card ? 1 : 0,
      };
    } catch (err) {
      if (!(err instanceof ScrappaUnavailableError)) throw err;
      const msg = err instanceof Error ? err.message : "unavailable";
      console.log(`rematch RT pause @${dest.code}: ${msg}`);
      job = pauseJob(job, msg);
      await saveRematchJob(admin, job);
      return {
        ok: true,
        running: true,
        paused: true,
        phase: "rt",
        dest: dest.code,
        lastError: msg,
        pausedUntil: job.pausedUntil,
      };
    }
  }

  // —— booking ——
  if (!job.bookingBreatherDone) {
    const until = new Date(Date.now() + SCRAPPA_PHASE_BREATHER_MS).toISOString();
    console.log(
      `rematch: booking öncesi ${SCRAPPA_PHASE_BREATHER_MS / 1000}s nefes`,
    );
    job = {
      ...job,
      bookingBreatherDone: true,
      heartbeatAt: new Date().toISOString(),
      pausedUntil: until,
      lastError: "faz nefes",
    };
    await saveRematchJob(admin, job);
    return {
      ok: true,
      running: true,
      paused: true,
      skipped: "faz nefes",
      pausedUntil: until,
      phase: "booking",
    };
  }

  // Boş pending şehirleri atla
  while (job.destIndex < rematchDestList(job).length) {
    const code = rematchDestList(job)[job.destIndex]!.code;
    const list = pendingList(job, code);
    if (list.length === 0) {
      job = {
        ...job,
        destIndex: job.destIndex + 1,
        bookingItemIndex: 0,
        heartbeatAt: new Date().toISOString(),
      };
      continue;
    }
    const itemIndex = job.bookingItemIndex ?? 0;
    if (itemIndex >= list.length) {
      job = {
        ...job,
        destIndex: job.destIndex + 1,
        bookingItemIndex: 0,
        heartbeatAt: new Date().toISOString(),
      };
      continue;
    }
    break;
  }

  if (job.destIndex >= rematchDestList(job).length) {
    const continueQueue = normalizeQueue(job.continueQueue);
    const finished: ScrappaRematchJob = {
      ...job,
      status: "idle",
      heartbeatAt: new Date().toISOString(),
      pausedUntil: undefined,
      lastError: undefined,
      sessionFailStreak: 0,
      continueQueue: [],
    };
    await saveRematchJob(admin, finished);
    const folded = await foldRematchProgress(admin, finished, {
      notify: job.notify !== false,
    });
    console.log("rematch: booking bitti", { count: folded.count });
    return {
      ok: folded.ok,
      running: false,
      finished: true,
      phase: "booking",
      count: folded.count,
      continueQueue,
      partnerChunk: job.partnerChunk,
      lastError: folded.error,
    };
  }

  const dest = rematchDestList(job)[job.destIndex]!;
  const list = [...pendingList(job, dest.code)];
  const itemIndex = job.bookingItemIndex ?? 0;
  const item = list[itemIndex]!;

  try {
    console.log(
      `rematch booking ${dest.code} [${itemIndex + 1}/${list.length}]`,
    );
    const deal = await applyBookingToDeal(item);
    if (deal) {
      list[itemIndex] = { deal, booking: undefined };
    } else {
      list.splice(itemIndex, 1);
    }
    const pending = pendingRecord(job);
    if (list.length > 0) pending[dest.code] = list;
    else delete pending[dest.code];

    const nextItemIndex = deal ? itemIndex + 1 : itemIndex;
    let nextDest = job.destIndex;
    let nextBooking = nextItemIndex;
    if (deal && nextItemIndex >= list.length) {
      nextDest = job.destIndex + 1;
      nextBooking = 0;
    } else if (!deal) {
      // silindi: aynı index’te sonraki eleman
      nextBooking = itemIndex;
      if (itemIndex >= list.length) {
        nextDest = job.destIndex + 1;
        nextBooking = 0;
      }
    }

    job = {
      ...job,
      destIndex: nextDest,
      bookingItemIndex: nextBooking,
      pendingByDest: pending,
      heartbeatAt: new Date().toISOString(),
      lastError: undefined,
      sessionFailStreak: 0,
      pausedUntil: undefined,
    };
    await saveRematchJob(admin, job);
    await foldRematchProgress(admin, job, { notify: true });
    return {
      ok: true,
      running: true,
      phase: "booking",
      dest: dest.code,
      count: deal ? 1 : 0,
    };
  } catch (err) {
    if (!(err instanceof ScrappaUnavailableError)) throw err;
    const msg = err instanceof Error ? err.message : "unavailable";
    console.log(`rematch booking pause @${dest.code}: ${msg}`);
    job = pauseJob(job, msg);
    await saveRematchJob(admin, job);
    return {
      ok: true,
      running: true,
      paused: true,
      phase: "booking",
      dest: dest.code,
      lastError: msg,
      pausedUntil: job.pausedUntil,
    };
  }
}

/** Sync / elle: job başlat + bitene kadar tick (pause’larda bekler). */
export async function runRematchToCompletion(
  admin: SupabaseClient,
  opts?: {
    force?: boolean;
    notify?: boolean;
    skipBreather?: boolean;
    continueQueue?: ScrappaQueueItem[];
  },
): Promise<{
  ok: boolean;
  count: number;
  error?: string;
  aborted?: boolean;
}> {
  const started = await startRematchJob(admin, {
    force: opts?.force !== false,
    notify: opts?.notify,
    skipBreather: opts?.skipBreather,
    continueQueue: opts?.continueQueue,
  });
  if (!started.ok && started.skipped === "rematch sürüyor") {
    // Mevcut işe yapış
  } else if (!started.ok) {
    return { ok: false, count: 0, error: started.skipped };
  }

  let lastCount = 0;
  for (;;) {
    const step = await runRematchTick(admin, { force: true });
    if (typeof step.count === "number") lastCount = step.count;
    if (step.finished) {
      return { ok: step.ok, count: step.count ?? lastCount, error: step.lastError };
    }
    if (!step.running) {
      const board = await readScanBoard(admin);
      return {
        ok: true,
        count: board.deals?.deals?.length ?? lastCount,
      };
    }
    if (step.paused && step.pausedUntil) {
      const wait = Date.parse(step.pausedUntil) - Date.now();
      await sleep(Math.max(5_000, wait));
      continue;
    }
    await sleep(50);
  }
}
