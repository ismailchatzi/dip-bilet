import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import type { ScrappaLane } from "@/lib/scan/scrappa-lane";
import { currentLane } from "@/lib/scan/scrappa-lane";

function lockFile(lane: ScrappaLane = currentLane()) {
  return resolve(process.cwd(), `.scrappa-worker-${lane}.lock`);
}

function pidAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function readLockPid(lane: ScrappaLane = currentLane()): number | null {
  try {
    const raw = JSON.parse(readFileSync(lockFile(lane), "utf8")) as { pid?: number };
    const pid = Number(raw.pid);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function dropDeadLock(lane: ScrappaLane = currentLane()) {
  try {
    unlinkSync(lockFile(lane));
  } catch {
    /* yok */
  }
}

export function lockPath(lane: ScrappaLane = currentLane()) {
  return lockFile(lane);
}

/** Sabah kesimi: kayıtlar boşaldıktan sonra canlı işçiyi kapat, kilidi düşür. */
export function stopLockedWorker(lane: ScrappaLane = currentLane()) {
  const pid = readLockPid(lane);
  if (pid != null && pid !== process.pid && pidAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* */
    }
  }
  dropDeadLock(lane);
}
export function otherLiveWorkerPid(lane: ScrappaLane = currentLane()): number | null {
  const pid = readLockPid(lane);
  if (pid == null) return null;
  if (pid === process.pid) return null;
  if (pidAlive(pid)) return pid;
  dropDeadLock(lane);
  return null;
}

let releaseHooked = false;

function releaseLock() {
  const lane = currentLane();
  const pid = readLockPid(lane);
  if (pid !== process.pid) return;
  dropDeadLock(lane);
}

/**
 * Tek işçi. Kalp atışına bakmaz: süreç yaşıyorsa ikinci açılmaz.
 * Mola, yavaş istek, 22:30 ve 05:00 aynı kapıdan geçer.
 */
export function acquireWorkerLock(lane: ScrappaLane = currentLane()):
  | { ok: true }
  | { ok: false; pid: number } {
  const other = otherLiveWorkerPid(lane);
  if (other != null) return { ok: false, pid: other };

  try {
    const fd = openSync(lockFile(lane), "wx");
    writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    closeSync(fd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw err;
    const raced = otherLiveWorkerPid(lane);
    if (raced != null) return { ok: false, pid: raced };
    return acquireWorkerLock(lane);
  }

  if (!releaseHooked) {
    releaseHooked = true;
    process.on("exit", releaseLock);
    process.on("SIGINT", () => {
      releaseLock();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      releaseLock();
      process.exit(0);
    });
  }
  return { ok: true };
}
