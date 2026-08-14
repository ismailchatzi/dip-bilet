import { createAdminClient } from "../../src/lib/supabase/admin";
import { runScrappaOneWayBatch } from "../../src/lib/scan/scrappa-oneway-runner";
import {
  cursorFromJob,
  enqueueScrappaWindow,
  isJobFresh,
  jobFromPayload,
  saveScrappaJob,
} from "../../src/lib/scan/scrappa-job";
import { readScanBoard } from "../../src/lib/scan/board";
import type { ScrappaJob } from "../../src/lib/types";
import type { ScrappaWindow } from "../../src/lib/scan/scrappa-horizon";

const TICK_PATH = "/.netlify/functions/scrappa-tick-background";
const SLICE_MS = 8 * 60 * 1000;
const MAX_BATCHES = 4;

function siteBase() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
}

async function kickTick() {
  const base = siteBase();
  const secret = process.env.CRON_SECRET?.trim();
  if (!base || !secret) {
    console.error("URL veya CRON_SECRET eksik");
    return;
  }
  try {
    const res = await fetch(`${base}${TICK_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    });
    console.log("scrappa tick kick", res.status);
  } catch (err) {
    console.error("scrappa tick kick fail", err);
  }
}

export async function startScrappaWindow(window: ScrappaWindow) {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    return;
  }
  await enqueueScrappaWindow(admin, window);
  await kickTick();
}

export async function runScrappaTick(force = false) {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    return;
  }

  const board = await readScanBoard(admin);
  let job = jobFromPayload(board.deals);
  if (!job || job.status !== "running") {
    console.log("scrappa tick: iş yok");
    return;
  }
  if (!force && isJobFresh(job)) {
    console.log("scrappa tick: başka dilim çalışıyor");
    return;
  }

  const deadline = Date.now() + SLICE_MS;
  let batches = 0;

  while (Date.now() < deadline && batches < MAX_BATCHES) {
    job = {
      ...job,
      heartbeatAt: new Date().toISOString(),
    };
    await saveScrappaJob(admin, job);

    const batch = await runScrappaOneWayBatch(admin, cursorFromJob(job));
    batches += 1;
    job = applyBatch(job, batch);
    await saveScrappaJob(admin, job);

    console.log("scrappa dilim", {
      dest: batch.dest,
      scanned: batch.scanned,
      saved: batch.saved,
      next: batch.next,
      errors: batch.errors,
    });

    if (job.status !== "running") break;
  }

  if (job.status === "running") {
    await kickTick();
  }
}

function applyBatch(
  job: ScrappaJob,
  batch: {
    done: boolean;
    next: { window: ScrappaWindow; destIndex: number; dateIndex: number } | null;
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
