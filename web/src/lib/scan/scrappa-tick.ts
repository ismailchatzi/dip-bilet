import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { SCANS_HALTED } from "@/lib/scan/halt";
import { runScrappaOneWayBatch } from "@/lib/scan/scrappa-oneway-runner";
import {
  cursorFromJob,
  enqueueScrappaWindow,
  isJobFresh,
  isJobStale,
  jobFromPayload,
  normalizeQueue,
  saveScrappaJob,
  stopScrappaJob,
} from "@/lib/scan/scrappa-job";
import {
  isRematchJobFresh,
  isRematchJobStale,
  rematchJobFromPayload,
  runRematchTick,
  saveRematchJob,
  startRematchJob,
} from "@/lib/scan/scrappa-rematch";
import {
  SCRAPPA_SESSION_CIRCUIT_AFTER,
  SCRAPPA_SESSION_CIRCUIT_PAUSE_MS,
  SCRAPPA_SESSION_SOFT_PAUSE_MS,
  SCRAPPA_TRANSIENT_PAUSE_MS,
  fullChunkRange,
  fullChunksForWeekday,
} from "@/lib/scan/scrappa-schedule";
import { currentLane } from "@/lib/scan/scrappa-lane";
import {
  obsWindowForFullPair,
  obsWindowForOneWayJob,
  type ScrappaObsWindow,
  type ScrappaWindow,
} from "@/lib/scan/scrappa-horizon";
import type { DealsPayload, ScrappaJob, ScrappaQueueItem } from "@/lib/types";

function trDateString(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(d);
}

/** Yalnız cookie_session vb. — çıplak 502 streak’e girmez. */
function isHardSessionOutageMessage(msg?: string) {
  return Boolean(
    msg &&
      /cookie_session|request_exhausted|oturum yok|validating|API key/i.test(
        msg,
      ),
  );
}

function applyBatch(
  job: ScrappaJob,
  batch: {
    hold?: boolean;
    lastError?: string;
    pauseMs?: number;
    matched?: number;
    next: {
      window: ScrappaWindow;
      destIndex: number;
      dateIndex: number;
      legIndex: number;
    } | null;
    scanned: number;
    saved: number;
  },
): ScrappaJob {
  const now = new Date().toISOString();
  const destStart = job.destStart ?? 0;
  const queue = normalizeQueue(job.queue);

  if (batch.hold) {
    const rewind = job.saved === 0;
    const hardSession = isHardSessionOutageMessage(batch.lastError);
    const transient = /geçici upstream/i.test(batch.lastError ?? "");
    const prev = job.sessionFailStreak ?? 0;
    let sessionFailStreak = 0;
    let pauseMs = batch.pauseMs ?? SCRAPPA_SESSION_SOFT_PAUSE_MS;

    if (hardSession || transient) {
      sessionFailStreak = prev + 1;
      if (sessionFailStreak >= SCRAPPA_SESSION_CIRCUIT_AFTER) {
        pauseMs = SCRAPPA_SESSION_CIRCUIT_PAUSE_MS;
        sessionFailStreak = 0;
      } else if (transient) {
        pauseMs = batch.pauseMs ?? SCRAPPA_TRANSIENT_PAUSE_MS;
      } else {
        pauseMs = SCRAPPA_SESSION_SOFT_PAUSE_MS;
      }
    }

    return {
      ...job,
      queue,
      destIndex: rewind ? destStart : job.destIndex,
      dateIndex: rewind ? 0 : job.dateIndex,
      legIndex: rewind ? 0 : job.legIndex,
      scanned: rewind ? 0 : job.scanned,
      saved: job.saved,
      heartbeatAt: now,
      lastError: batch.lastError,
      sessionFailStreak,
      pausedUntil: new Date(Date.now() + pauseMs).toISOString(),
    };
  }

  const scanned = job.scanned + batch.scanned;
  const saved = job.saved + batch.saved;

  const hitChunkEnd =
    batch.next != null &&
    job.destLimit != null &&
    batch.next.destIndex >= job.destLimit;

  if (batch.next && !hitChunkEnd) {
    return {
      ...job,
      queue,
      destIndex: batch.next.destIndex,
      dateIndex: batch.next.dateIndex,
      legIndex: batch.next.legIndex,
      window: batch.next.window,
      heartbeatAt: now,
      scanned,
      saved,
      lastError: undefined,
      sessionFailStreak: 0,
      pausedUntil: undefined,
    };
  }

  // Pencere bitti → idle; kuyruk rematch sonrası tick'te devam eder
  return {
    ...job,
    status: "idle",
    queue,
    heartbeatAt: now,
    scanned,
    saved,
    lastError: undefined,
    sessionFailStreak: 0,
    pausedUntil: undefined,
  };
}

export async function startScrappaWindow(
  window: ScrappaWindow,
  opts?: {
    force?: boolean;
    chunk?: number;
    queue?: ScrappaQueueItem[];
    partnerChunk?: number;
    partnerStartedAt?: string;
    skipRematch?: boolean;
  },
) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase yok" };
  if (SCANS_HALTED && !opts?.force) {
    return { ok: false, halted: true, error: "taramalar askıda" };
  }
  const enqueued = await enqueueScrappaWindow(admin, window, {
    force: opts?.force === true,
    chunk: opts?.chunk,
    queue: opts?.queue,
    partnerChunk: opts?.partnerChunk,
    partnerStartedAt: opts?.partnerStartedAt,
    skipRematch: opts?.skipRematch,
  });
  if (!enqueued.ok) {
    return {
      ok: false,
      error: enqueued.skipped ?? "başlatılamadı",
      skipped: enqueued.skipped,
    };
  }
  return {
    ok: true,
    window,
    chunk: enqueued.job?.chunk,
    destStart: enqueued.job?.destStart,
    destLimit: enqueued.job?.destLimit,
    queue: enqueued.job?.queue,
  };
}

function shouldForceNewDay(
  current: ScrappaJob | null,
  now: Date,
  forceFlag: boolean,
) {
  if (forceFlag) return true;
  if (!current) return false;
  const startedDay = trDateString(new Date(current.startedAt));
  const today = trDateString(now);
  if (startedDay < today) return true;
  return current.status === "running" && !current.halted && isJobStale(current);
}

/**
 * A: 05:00 near → rematch (yalnız o near yazımları). Full yok.
 * B: 05:01 günün 1. full → bitince 2. full → ikisinin rematch'i (yalnız o iki full yazımları).
 */
export async function startScrappaDay(opts?: {
  force?: boolean;
  chunk?: number;
  now?: Date;
}) {
  const now = opts?.now ?? new Date();
  const [c1, c2] = fullChunksForWeekday(now);
  const lane = currentLane();

  let force = opts?.force === true;
  const admin = createAdminClient();
  if (admin) {
    const current = jobFromPayload((await readScanBoard(admin)).deals);
    if (shouldForceNewDay(current, now, force)) {
      force = true;
      console.log(`start day ${lane}: yeni gün / bayat → force`);
    }
  }

  if (lane === "b") {
    // Elle tek dilim: yalnız o chunk. Normal gün: c1 → kuyrukta c2.
    if (opts?.chunk != null) {
      const range = fullChunkRange(opts.chunk);
      console.log(`start day B: full ${opts.chunk} (tek)`, range.codes, { force });
      return startScrappaWindow("full", {
        force,
        chunk: opts.chunk,
        queue: [],
        skipRematch: true,
      });
    }
    const range = fullChunkRange(c1);
    console.log(`start day B: full ${c1} → ${c2}`, range.codes, {
      next: fullChunkRange(c2).codes,
      force,
    });
    return startScrappaWindow("full", {
      force,
      chunk: c1,
      queue: [{ window: "full", chunk: c2 }],
      skipRematch: true,
    });
  }

  console.log(`start day A: near → rematch (full yok)`, { force });
  return startScrappaWindow("near", {
    force,
    queue: [],
  });
}

export async function stopScrappaScans(reason?: string) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase yok" };
  const why = reason ?? "elle durduruldu";
  const job = await stopScrappaJob(admin, why);
  // Rematch running kalırsa cron drain 4 dk’da tekrar basar — ikisini birden kes.
  const now = new Date().toISOString();
  await saveRematchJob(admin, {
    status: "idle",
    phase: "rt",
    destIndex: 0,
    heartbeatAt: now,
    startedAt: now,
    lastError: why,
    continueQueue: [],
    pausedUntil: undefined,
    sessionFailStreak: 0,
  });
  return { ok: true, job };
}

/**
 * Rematch / one-way sonrası günlük kuyruktaki sıradaki pencereyi başlat.
 * B: 1. full (skipRematch) bitince → 2. full (partner=1. dilim, bitince rematch).
 */
async function continueDayQueue(
  finished: Pick<
    ScrappaJob,
    | "queue"
    | "partnerChunk"
    | "partnerStartedAt"
    | "window"
    | "chunk"
    | "startedAt"
    | "skipRematch"
  >,
): Promise<{
  ok: boolean;
  window?: ScrappaWindow;
  chunk?: number;
  skipped?: string;
} | null> {
  const queue = normalizeQueue(finished.queue);
  const next = queue.shift();
  if (!next) return null;

  const chainSecondFull =
    finished.window === "full" &&
    next.window === "full" &&
    finished.skipRematch === true &&
    typeof finished.chunk === "number";

  console.log(
    `day-queue → ${next.window}${next.window === "full" ? ` ${next.chunk}` : ""}${
      chainSecondFull ? ` (B 2. full, partner ${finished.chunk})` : ""
    }`,
  );
  const started = await startScrappaWindow(next.window, {
    force: true,
    chunk: next.window === "full" ? next.chunk : undefined,
    queue,
    partnerChunk: chainSecondFull ? finished.chunk : finished.partnerChunk,
    partnerStartedAt: chainSecondFull
      ? finished.startedAt
      : finished.partnerStartedAt,
    skipRematch: chainSecondFull ? false : finished.skipRematch === true,
  });
  if (!started.ok) {
    console.log(`day-queue skip`, started.error ?? started.skipped);
    return {
      ok: false,
      skipped: started.error ?? started.skipped,
    };
  }
  return {
    ok: true,
    window: next.window,
    chunk: next.window === "full" ? next.chunk : undefined,
  };
}

/**
 * Dilim bitince rematch job kuyruğa alınır (blocking publish yok).
 * Drain (her 4 dk) kaldığı yerden RT+booking yapar.
 */
async function enqueueAutoRematch(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  continueQueue: ScrappaQueueItem[],
  extra?: {
    destCodes?: string[];
    partnerChunk?: number;
    obs?: ScrappaObsWindow;
  },
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const board = await readScanBoard(admin);
  const existing = rematchJobFromPayload(board.deals);
  if (existing?.status === "running" && !isRematchJobStale(existing)) {
    console.log("auto-rematch: mevcut job var — drain kaldığı yerden");
    if (
      continueQueue.length > 0 &&
      normalizeQueue(existing.continueQueue).length === 0
    ) {
      await saveRematchJob(admin, {
        ...existing,
        continueQueue: normalizeQueue(continueQueue),
        destCodes: extra?.destCodes ?? existing.destCodes,
        partnerChunk: extra?.partnerChunk ?? existing.partnerChunk,
        obsObservedAtGte:
          extra?.obs?.observedAtGte ?? existing.obsObservedAtGte,
        obsObservedAtLt: extra?.obs?.observedAtLt ?? existing.obsObservedAtLt,
        obsOutboundDateGte:
          extra?.obs?.outboundDateGte ?? existing.obsOutboundDateGte,
        obsOutboundDateLte:
          extra?.obs?.outboundDateLte ?? existing.obsOutboundDateLte,
        heartbeatAt: new Date().toISOString(),
      });
    }
    return { ok: true };
  }
  console.log("auto-rematch enqueue (drain devam eder)", {
    destCodes: extra?.destCodes?.length ?? "all",
    obs: extra?.obs,
  });
  const started = await startRematchJob(admin, {
    force: true,
    notify: true,
    continueQueue,
    destCodes: extra?.destCodes,
    partnerChunk: extra?.partnerChunk,
    obs: extra?.obs,
  });
  if (!started.ok) {
    console.log(`auto-rematch enqueue skip`, started.skipped);
    return { ok: false, skipped: started.skipped };
  }
  return { ok: true };
}

export async function runScrappaTick(force = false) {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, running: false, error: "Supabase yok" };
  }

  const board = await readScanBoard(admin);
  let job = jobFromPayload(board.deals);
  const rematchJob = rematchJobFromPayload(board.deals);

  // Elle start day --force, bugünkü iptal bayrağını siler. Global halt (halt.ts) force'u da keser.
  if (job?.halted && force && !SCANS_HALTED) {
    job = {
      ...job,
      halted: false,
      lastError: undefined,
      heartbeatAt: new Date().toISOString(),
    };
    await saveScrappaJob(admin, job);
  }

  if (SCANS_HALTED || job?.halted) {
    if (job && (job.status === "running" || !job.halted)) {
      job = {
        ...job,
        status: "idle",
        queue: [],
        halted: true,
        heartbeatAt: new Date().toISOString(),
        lastError: "taramalar askıda",
      };
      await saveScrappaJob(admin, job);
    }
    return { ok: true, running: false, halted: true, skipped: "taramalar askıda" };
  }

  // Rematch öncelikli: one-way ile aynı oturumu paylaşmaz (sıralı).
  if (rematchJob?.status === "running") {
    const step = await runRematchTick(admin, { force });
    let chain: {
      ok: boolean;
      window?: ScrappaWindow;
      chunk?: number;
      skipped?: string;
    } | null = null;
    if (step.finished && step.continueQueue && step.continueQueue.length > 0) {
      chain = await continueDayQueue({
        window: "near",
        startedAt: new Date().toISOString(),
        queue: step.continueQueue,
        partnerChunk: step.partnerChunk,
      });
      if (chain?.ok) {
        const refreshed = jobFromPayload((await readScanBoard(admin)).deals);
        if (refreshed) job = refreshed;
      }
    }
    const oneWayRunning =
      jobFromPayload((await readScanBoard(admin)).deals)?.status === "running";
    return {
      ok: step.ok,
      running: step.running || oneWayRunning,
      paused: step.paused === true,
      skipped: step.skipped,
      rematch: {
        ok: step.ok,
        phase: step.phase,
        dest: step.dest,
        count: step.count,
        finished: step.finished,
        error: step.lastError,
      },
      chain: chain ?? undefined,
      lastError: step.lastError,
      pausedUntil: step.pausedUntil,
    };
  }

  // A rematch (RT) aktifken B one-way basmasın — aynı IP’de RT yağmurunu kes.
  if (currentLane() === "b") {
    const aRematch = board.deals?.scrappaRematchJob;
    if (aRematch?.status === "running") {
      const until = new Date(Date.now() + 60_000).toISOString();
      if (job?.status === "running") {
        await saveScrappaJob(admin, {
          ...job,
          pausedUntil: until,
          lastError: "A rematch — B bekliyor",
          heartbeatAt: new Date().toISOString(),
        });
      }
      console.log("B: A rematch sürüyor — one-way bekliyor");
      return {
        ok: true,
        running: Boolean(job?.status === "running"),
        paused: true,
        skipped: "A rematch — B bekliyor",
        pausedUntil: until,
      };
    }
  }

  if (!job || job.status !== "running") {
    return { ok: true, running: false, skipped: "iş yok" };
  }
  const pausedUntil = job.pausedUntil ? Date.parse(job.pausedUntil) : 0;
  if (Number.isFinite(pausedUntil) && pausedUntil > Date.now()) {
    return {
      ok: true,
      running: true,
      paused: true,
      skipped: job.lastError || "Scrappa bekleniyor",
      pausedUntil: job.pausedUntil,
    };
  }
  if (!force && isJobFresh(job)) {
    return { ok: true, running: true, skipped: "dilim çalışıyor" };
  }

  if (job.lastError === "B full bekleniyor" && job.partnerChunk != null) {
    const peer = jobFromPayload((await readScanBoard(admin)).deals, "b");
    const peerLive =
      peer?.status === "running" &&
      !peer.halted &&
      peer.chunk === job.partnerChunk;
    if (peerLive) {
      const waiting: ScrappaJob = {
        ...job,
        status: "running",
        pausedUntil: new Date(Date.now() + 60_000).toISOString(),
        heartbeatAt: new Date().toISOString(),
      };
      await saveScrappaJob(admin, waiting);
      return {
        ok: true,
        running: true,
        paused: true,
        skipped: "B full bekleniyor",
        lastError: waiting.lastError,
        pausedUntil: waiting.pausedUntil,
      };
    }
    const partnerChunk = job.partnerChunk;
    job = { ...job, status: "idle", lastError: undefined, pausedUntil: undefined };
    await saveScrappaJob(admin, job);
    const destCodes = [
      ...fullChunkRange(partnerChunk).codes,
      ...(job.chunk != null ? fullChunkRange(job.chunk).codes : []),
    ];
    const rematch = await enqueueAutoRematch(admin, normalizeQueue(job.queue), {
      destCodes,
      partnerChunk,
      obs: obsWindowForFullPair(
        job,
        job.partnerStartedAt
          ? { startedAt: job.partnerStartedAt }
          : peer,
      ),
    });
    return {
      ok: rematch.ok,
      running: true,
      rematch: { ...rematch, enqueued: true },
      skipped: rematch.skipped,
    };
  }

  const batch = await runScrappaOneWayBatch(admin, cursorFromJob(job));
  const prevStatus = job.status;
  const finishedWindow = job.window;
  job = applyBatch(job, batch);
  await saveScrappaJob(admin, job);

  const becameIdle = prevStatus === "running" && job.status === "idle";
  const pendingQueue = normalizeQueue(job.queue);
  // Near bitince rematch. Full bitince: B skipRematch ise yok; A partner varsa B yazsın diye bekler.
  const shouldRematch =
    becameIdle &&
    !job.skipRematch &&
    (finishedWindow === "near" || pendingQueue.length === 0);

  if (
    becameIdle &&
    shouldRematch &&
    finishedWindow === "full" &&
    job.partnerChunk != null
  ) {
    const peer = jobFromPayload((await readScanBoard(admin)).deals, "b");
    const peerLive =
      peer?.status === "running" &&
      !peer.halted &&
      peer.chunk === job.partnerChunk;
    if (peerLive) {
      const waiting: ScrappaJob = {
        ...job,
        status: "running",
        lastError: "B full bekleniyor",
        pausedUntil: new Date(Date.now() + 60_000).toISOString(),
        heartbeatAt: new Date().toISOString(),
      };
      await saveScrappaJob(admin, waiting);
      console.log("A: B full yazılmadan rematch yok");
      return {
        ok: true,
        running: true,
        paused: true,
        dest: batch.dest,
        scanned: batch.scanned,
        saved: batch.saved,
        skipped: "B full bekleniyor",
        lastError: waiting.lastError,
        pausedUntil: waiting.pausedUntil,
      };
    }
  }
  if (becameIdle && !shouldRematch) {
    console.log("auto-rematch skip — sıradaki full dilim bekliyor");
  }

  let rematch:
    | { ok: boolean; skipped?: string; error?: string; enqueued?: boolean }
    | null = null;
  let chain: {
    ok: boolean;
    window?: ScrappaWindow;
    chunk?: number;
    skipped?: string;
  } | null = null;

  if (shouldRematch) {
    const destCodes =
      finishedWindow === "full" && job.partnerChunk != null
        ? [
            ...fullChunkRange(job.partnerChunk).codes,
            ...(job.chunk != null ? fullChunkRange(job.chunk).codes : []),
          ]
        : undefined;
    const peer =
      finishedWindow === "full"
        ? jobFromPayload((await readScanBoard(admin)).deals, "b")
        : null;
    const obs =
      finishedWindow === "near"
        ? obsWindowForOneWayJob(job)
        : finishedWindow === "full"
          ? obsWindowForFullPair(
              job,
              job.partnerStartedAt
                ? { startedAt: job.partnerStartedAt }
                : peer,
            )
          : undefined;
    rematch = {
      ...(await enqueueAutoRematch(admin, pendingQueue, {
        destCodes,
        partnerChunk: job.partnerChunk,
        obs,
      })),
      enqueued: true,
    };
  } else if (becameIdle) {
    chain = await continueDayQueue(job);
    if (chain?.ok) {
      const refreshed = jobFromPayload((await readScanBoard(admin)).deals);
      if (refreshed) job = refreshed;
    }
  }

  const rematchRunning =
    rematchJobFromPayload((await readScanBoard(admin)).deals)?.status ===
    "running";

  return {
    ok: batch.ok,
    running: job.status === "running" || rematchRunning,
    paused: batch.hold === true,
    dest: batch.dest,
    scanned: batch.scanned,
    saved: batch.saved,
    matched: batch.matched,
    rematch: rematch ?? undefined,
    chain: chain ?? undefined,
    next: batch.next,
    errors: batch.errors,
    lastError: batch.lastError ?? job.lastError,
    pausedUntil: job.pausedUntil,
  };
}

/** Drain / worker: rematch veya one-way taze mi (canlı süreç var). */
export function isAnyScrappaWorkFresh(deals: DealsPayload | null | undefined) {
  return (
    isJobFresh(jobFromPayload(deals)) ||
    isRematchJobFresh(rematchJobFromPayload(deals))
  );
}
