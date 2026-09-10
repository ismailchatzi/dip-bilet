import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { currentLane, type ScrappaLane } from "@/lib/scan/scrappa-lane";
import type { ScrappaCursor } from "@/lib/scan/scrappa-oneway-runner";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import { fullChunkRange } from "@/lib/scan/scrappa-schedule";
import type {
  DealsPayload,
  ScrappaJob,
  ScrappaQueueItem,
  ScrappaRematchJob,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export function jobFromPayload(
  deals: DealsPayload | null | undefined,
  lane: ScrappaLane = currentLane(),
) {
  if (!deals) return null;
  return lane === "b" ? (deals.scrappaJobB ?? null) : (deals.scrappaJob ?? null);
}

/** Planlı mola (15 sn / 5 dk). Bu sürede heartbeat eski görünür; ikinci drain açma. */
export function isIntentionallyPaused(job: { pausedUntil?: string } | null | undefined) {
  if (!job?.pausedUntil) return false;
  const t = Date.parse(job.pausedUntil);
  return Number.isFinite(t) && t > Date.now();
}

export function isJobFresh(job: ScrappaJob | null, maxAgeMs = 20 * 1000) {
  if (!job || job.status !== "running") return false;
  if (isIntentionallyPaused(job)) return true;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}

/** Drain ölmüş “running” job — sabah start day üzerine yazabilsin. */
export function isJobStale(job: ScrappaJob | null, maxAgeMs = 15 * 60 * 1000) {
  if (!job || job.status !== "running") return true;
  if (isIntentionallyPaused(job)) return false;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > maxAgeMs;
}

function isRematchBlocking(job: ScrappaRematchJob | null | undefined) {
  if (!job || job.status !== "running") return false;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return false;
  // Bayat rematch one-way’i kilitlemesin (15 dk).
  return Date.now() - t <= 15 * 60 * 1000;
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
        scrappaJobB: undefined,
      },
    });
  }
  const lane = currentLane();
  return patchScanBoard(admin, {
    deals:
      lane === "b"
        ? { ...deals, scrappaJobB: job ?? undefined }
        : { ...deals, scrappaJob: job ?? undefined },
  });
}

export async function enqueueScrappaWindow(
  admin: SupabaseClient,
  window: ScrappaWindow,
  opts?: {
    force?: boolean;
    chunk?: number;
    queue?: ScrappaQueueItem[];
    partnerChunk?: number;
    skipRematch?: boolean;
  },
): Promise<{ ok: boolean; skipped?: string; job?: ScrappaJob }> {
  const board = await readScanBoard(admin);
  const current = jobFromPayload(board.deals);
  const rematch =
    currentLane() === "b"
      ? board.deals?.scrappaRematchJobB
      : board.deals?.scrappaRematchJob;
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

  // Rematch sürerken one-way başlatma (aynı Scrappa oturumu).
  if (isRematchBlocking(rematch) && !opts?.force) {
    return { ok: false, skipped: "rematch sürüyor", job: current ?? undefined };
  }

  // Dilimler çakışmasın: canlı job varken yenisi yok.
  // Drain ölü + status running kalırsa (heartbeat bayat) sabah start day takılmasın.
  if (
    current?.status === "running" &&
    !current.halted &&
    !opts?.force &&
    !isJobStale(current)
  ) {
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
    sessionFailStreak: 0,
    halted: false,
    destStart,
    destLimit,
    chunk,
    partnerChunk: opts?.partnerChunk,
    skipRematch: opts?.skipRematch === true,
  };
  await saveScrappaJob(admin, job);
  return { ok: true, job };
}

/** Çalışan / bekleyen taramayı durdur; kuyruğu temizle. */
export async function stopScrappaJob(
  admin: SupabaseClient,
  reason = "elle durduruldu",
  opts?: { resetStartedAt?: boolean },
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
    startedAt: opts?.resetStartedAt ? now : (current?.startedAt ?? now),
    scanned: current?.scanned ?? 0,
    saved: current?.saved ?? 0,
    lastError: reason,
    pausedUntil: undefined,
    sessionFailStreak: 0,
    halted: false,
    destStart: current?.destStart,
    destLimit: current?.destLimit,
    chunk: current?.chunk,
    partnerChunk: current?.partnerChunk,
    skipRematch: current?.skipRematch,
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
