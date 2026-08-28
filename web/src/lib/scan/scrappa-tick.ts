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
import { publishAllShowcase } from "@/lib/scan/scrappa-match";
import {
  fullChunkForWeekday,
  fullChunkRange,
  fullChunksForWeekday,
  SCRAPPA_SESSION_CIRCUIT_AFTER,
  SCRAPPA_SESSION_CIRCUIT_PAUSE_MS,
  SCRAPPA_SESSION_SOFT_PAUSE_MS,
} from "@/lib/scan/scrappa-schedule";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import type { ScrappaJob, ScrappaQueueItem } from "@/lib/types";

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

/**
 * Günlük kuyruk: near → rematch → full A → full B → rematch.
 * Full A/B arasında rematch yok (arka arkaya).
 * Önceki takvim gününden kalan running job 05:00'ı bloklamasın → force.
 */
export async function startScrappaDay(opts?: {
  force?: boolean;
  chunk?: number;
  now?: Date;
}) {
  const now = opts?.now ?? new Date();
  const [c1, c2] = fullChunksForWeekday(now);
  const chunks =
    opts?.chunk != null ? [opts.chunk] : [c1, c2];
  const ranges = chunks.map((c) => fullChunkRange(c));

  let force = opts?.force === true;
  if (!force) {
    const admin = createAdminClient();
    if (admin) {
      const current = jobFromPayload((await readScanBoard(admin)).deals);
      if (current?.status === "running" && !current.halted) {
        if (isJobStale(current)) {
          force = true;
          console.log("start day: bayat job → force");
        } else {
          const startedDay = trDateString(new Date(current.startedAt));
          const today = trDateString(now);
          if (startedDay < today) {
            force = true;
            console.log(
              `start day: önceki gün işi (${startedDay}) → force, bugün ${today}`,
            );
          }
        }
      }
    }
  }

  console.log(
    `start day: near → full ${ranges.map((r) => r.chunk).join("+")}`,
    ranges.flatMap((r) => r.codes),
    { force },
  );
  const queue = chunks.map((chunk) => ({ window: "full" as const, chunk }));
  return startScrappaWindow("near", {
    force,
    queue,
  });
}

export async function stopScrappaScans(reason?: string) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase yok" };
  const job = await stopScrappaJob(admin, reason ?? "elle durduruldu");
  return { ok: true, job };
}

/**
 * Dilim bitince: nefes → RT rematch → nefes → booking → (kuyrukta full varsa) full.
 */
async function autoRematchIfNeeded(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  opts: {
    becameIdle: boolean;
    sessionRecovered: boolean;
  },
): Promise<{ ok: boolean; count?: number; error?: string } | null> {
  if (!opts.becameIdle && !opts.sessionRecovered) return null;
  try {
    const reason = opts.becameIdle ? "dilim-bitti" : "oturum-toparlandi";
    console.log(`auto-rematch (${reason})`);
    const result = await publishAllShowcase(admin, { notify: true });
    console.log(`auto-rematch done`, result);
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : "rematch hata";
    console.log(`auto-rematch fail`, error);
    return { ok: false, error };
  }
}

/**
 * Rematch sonrası günlük kuyruktaki sıradaki pencereyi başlat.
 */
async function continueDayQueue(
  finished: ScrappaJob,
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

export async function runScrappaTick(force = false) {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, running: false, error: "Supabase yok" };
  }

  const board = await readScanBoard(admin);
  let job = jobFromPayload(board.deals);
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

  const batch = await runScrappaOneWayBatch(admin, cursorFromJob(job));
  const prevStatus = job.status;
  const finishedWindow = job.window;
  job = applyBatch(job, batch);
  await saveScrappaJob(admin, job);

  const becameIdle = prevStatus === "running" && job.status === "idle";
  const pendingQueue = normalizeQueue(job.queue);
  // Near bitince veya günün son full'ü bitince rematch; ara full'ler arasında yok.
  const shouldRematch =
    becameIdle &&
    (finishedWindow === "near" || pendingQueue.length === 0);
  if (becameIdle && !shouldRematch) {
    console.log("auto-rematch skip — sıradaki full dilim bekliyor");
  }
  const rematch = shouldRematch
    ? await autoRematchIfNeeded(admin, {
        becameIdle: true,
        sessionRecovered: false,
      })
    : null;

  let chain: {
    ok: boolean;
    window?: ScrappaWindow;
    chunk?: number;
    skipped?: string;
  } | null = null;
  if (becameIdle) {
    chain = await continueDayQueue(job);
    if (chain?.ok) {
      const refreshed = jobFromPayload((await readScanBoard(admin)).deals);
      if (refreshed) job = refreshed;
    }
  }

  return {
    ok: batch.ok,
    running: job.status === "running",
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
