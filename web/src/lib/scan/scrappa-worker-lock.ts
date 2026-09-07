import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { resolve } from "node:path";

const LOCK_PATH = resolve(process.cwd(), ".scrappa-worker.lock");

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

function readLockPid(): number | null {
  try {
    const raw = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as { pid?: number };
    const pid = Number(raw.pid);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function dropDeadLock() {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* yok */
  }
}

/** Başka canlı işçi varsa pid. Ölü kilit dosyasını siler. */
export function otherLiveWorkerPid(): number | null {
  const pid = readLockPid();
  if (pid == null) return null;
  if (pid === process.pid) return null;
  if (pidAlive(pid)) return pid;
  dropDeadLock();
  return null;
}

let releaseHooked = false;

function releaseLock() {
  const pid = readLockPid();
  if (pid !== process.pid) return;
  dropDeadLock();
}

/**
 * Tek işçi. Kalp atışına bakmaz: süreç yaşıyorsa ikinci açılmaz.
 * Mola, yavaş istek, 22:30 ve 05:00 aynı kapıdan geçer.
 */
export function acquireWorkerLock():
  | { ok: true }
  | { ok: false; pid: number } {
  const other = otherLiveWorkerPid();
  if (other != null) return { ok: false, pid: other };

  try {
    const fd = openSync(LOCK_PATH, "wx");
    writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    closeSync(fd);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw err;
    const raced = otherLiveWorkerPid();
    if (raced != null) return { ok: false, pid: raced };
    return acquireWorkerLock();
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
