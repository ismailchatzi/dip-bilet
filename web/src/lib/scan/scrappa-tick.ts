import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { SCANS_HALTED } from "@/lib/scan/halt";
import { runScrappaOneWayBatch } from "@/lib/scan/scrappa-oneway-runner";
import {
  cursorFromJob,
  enqueueScrappaWindow,
  isJobFresh,
  jobFromPayload,
  saveScrappaJob,
} from "@/lib/scan/scrappa-job";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import type { ScrappaJob } from "@/lib/types";

function applyBatch(
  job: ScrappaJob,
  batch: {
    hold?: boolean;
    lastError?: string;
    pauseMs?: number;
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

  if (batch.hold) {
    const rewind = job.saved === 0;
    return {
      ...job,
      destIndex: rewind ? destStart : job.destIndex,
      dateIndex: rewind ? 0 : job.dateIndex,
      legIndex: rewind ? 0 : job.legIndex,
      scanned: rewind ? 0 : job.scanned,
      saved: job.saved,
      heartbeatAt: now,
      lastError: batch.lastError,
      pausedUntil: new Date(
        Date.now() + (batch.pauseMs ?? 20 * 1000),
      ).toISOString(),
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
      destIndex: batch.next.destIndex,
      dateIndex: batch.next.dateIndex,
      legIndex: batch.next.legIndex,
      window: batch.next.window,
      heartbeatAt: now,
      scanned,
      saved,
      lastError: undefined,
      pausedUntil: undefined,
    };
  }

  const queue = [...(job.queue ?? [])];
  const nextWindow = queue.shift();
  if (nextWindow) {
    return {
      status: "running",
      window: nextWindow,
      destIndex: 0,
      dateIndex: 0,
      legIndex: 0,
      queue,
      heartbeatAt: now,
      startedAt: now,
      scanned,
      saved,
      lastError: undefined,
      pausedUntil: undefined,
      destStart: 0,
      destLimit: undefined,
      chunk: undefined,
    };
  }

  return {
    ...job,
    status: "idle",
    queue: [],
    heartbeatAt: now,
    scanned,
    saved,
    lastError: undefined,
    pausedUntil: undefined,
  };
}

export async function startScrappaWindow(
  window: ScrappaWindow,
  opts?: { force?: boolean; chunk?: number },
) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase yok" };
  if (SCANS_HALTED && !opts?.force) {
    return { ok: false, halted: true, error: "taramalar askıda" };
  }
  const enqueued = await enqueueScrappaWindow(admin, window, {
    force: opts?.force === true,
    chunk: opts?.chunk,
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
  job = applyBatch(job, batch);
  await saveScrappaJob(admin, job);

  return {
    ok: batch.ok,
    running: job.status === "running",
    paused: batch.hold === true,
    dest: batch.dest,
    scanned: batch.scanned,
    saved: batch.saved,
    next: batch.next,
    errors: batch.errors,
    lastError: batch.lastError ?? job.lastError,
    pausedUntil: job.pausedUntil,
  };
}
