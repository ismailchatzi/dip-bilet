import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
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
  const scanned = job.scanned + batch.scanned;
  const saved = job.saved + batch.saved;
  const now = new Date().toISOString();

  if (batch.next) {
    return {
      ...job,
      destIndex: batch.next.destIndex,
      dateIndex: batch.next.dateIndex,
      legIndex: batch.next.legIndex,
      window: batch.next.window,
      heartbeatAt: now,
      scanned,
      saved,
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
    };
  }

  return {
    ...job,
    status: "idle",
    queue: [],
    heartbeatAt: now,
    scanned,
    saved,
  };
}

export async function startScrappaWindow(window: ScrappaWindow) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase yok" };
  await enqueueScrappaWindow(admin, window);
  return { ok: true, window };
}

export async function runScrappaTick(force = false) {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, running: false, error: "Supabase yok" };
  }

  const board = await readScanBoard(admin);
  let job = jobFromPayload(board.deals);
  if (!job || job.status !== "running") {
    return { ok: true, running: false, skipped: "iş yok" };
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
    dest: batch.dest,
    scanned: batch.scanned,
    saved: batch.saved,
    next: batch.next,
    errors: batch.errors,
  };
}
