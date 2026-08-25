import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import type { ScrappaCursor } from "@/lib/scan/scrappa-oneway-runner";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import { fullChunkRange } from "@/lib/scan/scrappa-schedule";
import type { DealsPayload, ScrappaJob, ScrappaQueueItem } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export function jobFromPayload(deals: DealsPayload | null | undefined) {
  return deals?.scrappaJob ?? null;
}

export function isJobFresh(job: ScrappaJob | null, maxAgeMs = 20 * 1000) {
  if (!job || job.status !== "running") return false;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}

/** Eski string kuyruk / bozuk kayıtları normalize et. */
export function normalizeQueue(raw: unknown): ScrappaQueueItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ScrappaQueueItem[] = [];
  for (const item of raw) {
    if (item === "near") {
      out.push({ window: "near" });
      continue;
    }
    if (item === "full") continue;
    if (
      item &&
      typeof item === "object" &&
      (item as ScrappaQueueItem).window === "near"
    ) {
      out.push({ window: "near" });
      continue;
    }
    if (
      item &&
      typeof item === "object" &&
      (item as ScrappaQueueItem).window === "full"
    ) {
      const chunk = Number((item as { chunk?: number }).chunk);
      if (Number.isFinite(chunk) && chunk >= 1) {
        out.push({ window: "full", chunk: Math.floor(chunk) });
      }
    }
  }
  return out;
}

export async function saveScrappaJob(
  admin: SupabaseClient,
  job: ScrappaJob | null,
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
        scrappaJob: job ?? undefined,
      },
    });
  }
  return patchScanBoard(admin, {
    deals: { ...deals, scrappaJob: job ?? undefined },
  });
}

export async function enqueueScrappaWindow(
  admin: SupabaseClient,
  window: ScrappaWindow,
  opts?: {
    force?: boolean;
    chunk?: number;
    queue?: ScrappaQueueItem[];
  },
): Promise<{ ok: boolean; skipped?: string; job?: ScrappaJob }> {
  const board = await readScanBoard(admin);
  const current = jobFromPayload(board.deals);
  const now = new Date().toISOString();
  if (current?.halted && !opts?.force) {
    const halted: ScrappaJob = {
      ...current,
      status: "idle",
      queue: [],
      heartbeatAt: now,
      halted: true,
      lastError: current.lastError || "taramalar askıda",
    };
    await saveScrappaJob(admin, halted);
    return { ok: false, skipped: "halted", job: halted };
  }

  // Dilimler çakışmasın: önceki job bitmeden yenisi yok
  if (current?.status === "running" && !current.halted && !opts?.force) {
    return { ok: false, skipped: "önceki dilim bitmedi", job: current };
  }

  let destStart = 0;
  let destLimit: number | undefined;
  let chunk: number | undefined;
  if (window === "full" && opts?.chunk != null) {
    const range = fullChunkRange(opts.chunk);
    destStart = range.destStart;
    destLimit = range.destLimit;
    chunk = range.chunk;
  }

  const job: ScrappaJob = {
    status: "running",
    window,
    destIndex: destStart,
    dateIndex: 0,
    legIndex: 0,
    queue: normalizeQueue(opts?.queue ?? []),
    heartbeatAt: now,
    startedAt: now,
    scanned: 0,
    saved: 0,
    lastError: undefined,
    pausedUntil: undefined,
    halted: false,
    destStart,
    destLimit,
    chunk,
  };
  await saveScrappaJob(admin, job);
  return { ok: true, job };
}

/** Çalışan / bekleyen taramayı durdur; kuyruğu temizle. */
export async function stopScrappaJob(
  admin: SupabaseClient,
  reason = "elle durduruldu",
): Promise<ScrappaJob | null> {
  const board = await readScanBoard(admin);
  const current = jobFromPayload(board.deals);
  const now = new Date().toISOString();
  const job: ScrappaJob = {
    status: "idle",
    window: current?.window ?? "near",
    destIndex: current?.destIndex ?? 0,
    dateIndex: current?.dateIndex ?? 0,
    legIndex: current?.legIndex ?? 0,
    queue: [],
    heartbeatAt: now,
    startedAt: current?.startedAt ?? now,
    scanned: current?.scanned ?? 0,
    saved: current?.saved ?? 0,
    lastError: reason,
    pausedUntil: undefined,
    halted: false,
    destStart: current?.destStart,
    destLimit: current?.destLimit,
    chunk: current?.chunk,
  };
  await saveScrappaJob(admin, job);
  return job;
}

export function cursorFromJob(job: ScrappaJob): ScrappaCursor {
  return {
    window: job.window,
    destIndex: job.destIndex,
    dateIndex: job.dateIndex,
    legIndex: job.legIndex ?? 0,
  };
}
