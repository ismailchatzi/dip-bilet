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
  fullChunkRange,
  fullChunksForWeekday,
  SCRAPPA_SESSION_CIRCUIT_AFTER,
  SCRAPPA_SESSION_CIRCUIT_PAUSE_MS,
  SCRAPPA_SESSION_SOFT_PAUSE_MS,
} from "@/lib/scan/scrappa-schedule";
import { currentLane } from "@/lib/scan/scrappa-lane";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import type { DealsPayload, ScrappaJob, ScrappaQueueItem } from "@/lib/types";

function trDateString(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(d);
}

function isSessionOutageMessage(msg?: string) {
  return Boolean(
    msg &&
      /cookie_session|request_exhausted|\b502\b|\b503\b|oturum|unavailable|API key|validating/i.test(
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
    const sessionOutage = isSessionOutageMessage(batch.lastError);
    const sessionFailStreak = sessionOutage
      ? (job.sessionFailStreak ?? 0) + 1
      : 0;
    const pauseMs =
      sessionOutage && sessionFailStreak >= SCRAPPA_SESSION_CIRCUIT_AFTER
        ? SCRAPPA_SESSION_CIRCUIT_PAUSE_MS
        : (batch.pauseMs ?? SCRAPPA_SESSION_SOFT_PAUSE_MS);
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
 * A: 05:00 near → rematch → günün 2. full'ü → B'nin 1. full'ü yazılınca ikisinin rematch'i.
 * B: 05:00 günün 1. full'ü, bitince rematch yok. 22:30 ayrı.
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
    const chunk = opts?.chunk ?? c1;
    const range = fullChunkRange(chunk);
    console.log(`start day B: full ${chunk}`, range.codes, { force });
    return startScrappaWindow("full", {
      force,
      chunk,
      queue: [],
      skipRematch: true,
    });
  }

  const range = fullChunkRange(c2);
  console.log(
    `start day A: near → rematch → full ${c2}`,
    range.codes,
    { partner: c1, force },
  );
  return startScrappaWindow("near", {
    force,
    queue: [{ window: "full", chunk: c2 }],
    partnerChunk: c1,
  });
}

export async function stopScrappaScans(reason?: string) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase yok" };
  const job = await stopScrappaJob(admin, reason ?? "elle durduruldu");
  return { ok: true, job };
}

/**
 * Rematch sonrası günlük kuyruktaki sıradaki pencereyi başlat.
 */
async function continueDayQueue(
  finished: { queue?: ScrappaQueueItem[]; partnerChunk?: number },
): Promise<{
  ok: boolean;
  window?: ScrappaWindow;
  chunk?: number;
  skipped?: string;
} | null> {
  const queue = normalizeQueue(finished.queue);
  const next = queue.shift();
  if (!next) return null;

  console.log(
    `day-queue → ${next.window}${next.window === "full" ? ` ${next.chunk}` : ""}`,
  );
  const started = await startScrappaWindow(next.window, {
    force: true,
    chunk: next.window === "full" ? next.chunk : undefined,
    queue,
    partnerChunk: finished.partnerChunk,
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
  extra?: { destCodes?: string[]; partnerChunk?: number },
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
        heartbeatAt: new Date().toISOString(),
      });
    }
    return { ok: true };
  }
  console.log("auto-rematch enqueue (drain devam eder)");
  const started = await startRematchJob(admin, {
    force: true,
    notify: true,
    continueQueue,
    destCodes: extra?.destCodes,
    partnerChunk: extra?.partnerChunk,
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
    rematch = {
      ...(await enqueueAutoRematch(admin, pendingQueue, {
        destCodes,
        partnerChunk: job.partnerChunk,
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
