import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import type { ScrappaCursor } from "@/lib/scan/scrappa-oneway-runner";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import type { DealsPayload, ScrappaJob } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export function jobFromPayload(deals: DealsPayload | null | undefined) {
  return deals?.scrappaJob ?? null;
}

export function isJobFresh(job: ScrappaJob | null, maxAgeMs = 4 * 60 * 1000) {
  if (!job || job.status !== "running") return false;
  const t = Date.parse(job.heartbeatAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
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
) {
  const board = await readScanBoard(admin);
  const current = jobFromPayload(board.deals);
  const now = new Date().toISOString();

  if (current?.status === "running") {
    const startedDay = (current.startedAt ?? "").slice(0, 10);
    const today = new Date(Date.now() + 3 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (startedDay === today) {
      const queue = [...(current.queue ?? [])];
      if (current.window !== window && !queue.includes(window)) {
        queue.push(window);
      }
      return saveScrappaJob(admin, { ...current, queue, heartbeatAt: now });
    }
  }

  return saveScrappaJob(admin, {
    status: "running",
    window,
    destIndex: 0,
    dateIndex: 0,
    queue: [],
    heartbeatAt: now,
    startedAt: now,
    scanned: 0,
    saved: 0,
  });
}

export function cursorFromJob(job: ScrappaJob): ScrappaCursor {
  return {
    window: job.window,
    destIndex: job.destIndex,
    dateIndex: job.dateIndex,
  };
}
