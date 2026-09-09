/**
 * Netlify dışı Scrappa taraması. VPS (TZ=Europe/Istanbul):
 *
 * İki hesap, ayrı kilit: .scrappa-worker-a.lock / .scrappa-worker-b.lock
 * A ve B birbirinin kilidine bakmaz. Aynı hesapta ikinci süreç yok.
 *
 * One-way gap 2s. Art arda 7× 502/503 → 5 dk pause, kaldığı yerden.
 * Env: SCRAPPA_API_KEY (A), SCRAPPA_API_KEY_B (B)
 */
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  runScrappaTick,
  startScrappaDay,
  startScrappaWindow,
  stopScrappaScans,
} from "@/lib/scan/scrappa-tick";
import {
  rematchJobFromPayload,
  saveRematchJob,
  startRematchJob,
} from "@/lib/scan/scrappa-rematch";
import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { jobFromPayload, stopScrappaJob } from "@/lib/scan/scrappa-job";
import { acquireWorkerLock, otherLiveWorkerPid, stopLockedWorker } from "@/lib/scan/scrappa-worker-lock";
import { bindLaneApiKey, parseLane, type ScrappaLane } from "@/lib/scan/scrappa-lane";
import {
  FULL_CHUNK_COUNT,
  SCRAPPA_REQUEST_GAP_MS,
  fullChunksForWeekday,
  fullChunkRange,
  scrappaCrontabLines,
} from "@/lib/scan/scrappa-schedule";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseWindow(raw: string | undefined): ScrappaWindow | null {
  if (raw === "full" || raw === "near") return raw;
  return null;
}

function parseChunk(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > FULL_CHUNK_COUNT) return undefined;
  return Math.floor(n);
}

/** İkinci süreç yok. Kilit varsa çık; yoksa al ve tek döngüye gir. */
function claimWorkerOrExit(why: string, lane: ScrappaLane) {
  const other = otherLiveWorkerPid(lane);
  if (other != null) {
    console.log(`${why}: işçi zaten var pid=${other} — ikinci açılmadı`);
    process.exit(0);
  }
  const lock = acquireWorkerLock(lane);
  if (!lock.ok) {
    console.log(`${why}: işçi zaten var pid=${lock.pid} — ikinci açılmadı`);
    process.exit(0);
  }
}

async function drain(force = false) {
  for (;;) {
    // force=true: start day/near sahibi süreç. Cron drain force=false (çakışmasın).
    const result = await runScrappaTick(force);
    const pausedUntil =
      "pausedUntil" in result && typeof result.pausedUntil === "string"
        ? result.pausedUntil
        : undefined;
    const dest = "dest" in result ? result.dest : undefined;
    const scanned = "scanned" in result ? result.scanned : undefined;
    const saved = "saved" in result ? result.saved : undefined;
    const skipped = "skipped" in result ? result.skipped : undefined;
    console.log(
      new Date().toISOString(),
      process.env.SCRAPPA_LANE ?? "a",
      JSON.stringify({
        running: result.running,
        paused: "paused" in result ? result.paused : false,
        dest,
        scanned,
        saved,
        skipped,
        rematch: "rematch" in result ? result.rematch : undefined,
        chain: "chain" in result ? result.chain : undefined,
        lastError: "lastError" in result ? result.lastError : undefined,
      }),
    );

    // Cron drain: canlı start-day/drain varken süreç fırtınası yapma
    if (!force && skipped === "dilim çalışıyor") return;

    if (!result.running) return;
    if ("paused" in result && result.paused) {
      const wait = pausedUntil
        ? Date.parse(pausedUntil) - Date.now()
        : 20 * 1000;
      await sleep(Math.max(5_000, wait));
      continue;
    }
    await sleep(SCRAPPA_REQUEST_GAP_MS);
  }
}

async function main() {
  loadEnv();
  const first = process.argv[2] ?? "";

  if (first === "crontab") {
    for (const line of scrappaCrontabLines()) console.log(line);
    return;
  }

  if (first === "cutoff") {
    const admin = createAdminClient();
    if (!admin) {
      console.error("SUPABASE_SERVICE_ROLE_KEY yok");
      process.exit(1);
    }
    const reason = "04:55 kesim — 05:00 yeni gün";
    const now = new Date().toISOString();
    for (const lane of ["a", "b"] as const) {
      bindLaneApiKey(lane);
      await stopScrappaJob(admin, reason);
      await saveRematchJob(admin, {
        status: "idle",
        phase: "rt",
        destIndex: 0,
        heartbeatAt: now,
        startedAt: now,
        lastError: reason,
        continueQueue: [],
        pausedUntil: undefined,
        sessionFailStreak: 0,
      });
      stopLockedWorker(lane);
    }
    const legacyLock = resolve(process.cwd(), ".scrappa-worker.lock");
    if (existsSync(legacyLock)) {
      try {
        unlinkSync(legacyLock);
      } catch {
        /* yok */
      }
    }
    console.log("cutoff: A ve B durdu, işçiler kapatıldı");
    return;
  }

  const prefixed = parseLane(first);
  const legacy = first === "start" || first === "drain" || first === "rematch" || first === "stop";
  const lane = prefixed ?? (legacy ? "a" : null);
  if (!lane) {
    console.error(
      "kullanım: a|b start day | a|b drain | a|b rematch | a|b stop | cutoff | crontab",
    );
    process.exit(1);
  }
  const cmd = prefixed ? (process.argv[3] ?? "drain") : first;
  const arg = (n: number) => process.argv[(prefixed ? 4 : 3) + n];
  const bound = bindLaneApiKey(lane);
  if (!bound.ok && cmd !== "stop") {
    console.error(bound.error);
    process.exit(1);
  }

  if (cmd === "stop") {
    const stopped = await stopScrappaScans(
      arg(0) ?? "worker stop — eski takvim iptal",
    );
    console.log("stop", stopped);
    return;
  }

  if (cmd === "start") {
    claimWorkerOrExit("start", lane);
    const mode = arg(0);
    if (mode === "day") {
      const chunkArg = parseChunk(arg(1));
      if (chunkArg != null) {
        console.log("day chunk (override)", fullChunkRange(chunkArg));
      } else {
        const [c1, c2] = fullChunksForWeekday();
        console.log("day chunks", fullChunkRange(c1), fullChunkRange(c2));
      }
      const started = await startScrappaDay({
        force: process.argv.includes("--force"),
        chunk: chunkArg,
      });
      console.log("start day", started);
      if (!started.ok) process.exit(1);
      await drain(true);
      return;
    }

    const window = parseWindow(mode);
    if (!window) {
      console.error(
        "kullanım: a|b start day | a|b start near|full [chunk] | a|b stop | a|b drain | a|b rematch | cutoff | crontab",
      );
      process.exit(1);
    }
    const chunk =
      window === "full" ? parseChunk(arg(1)) : undefined;
    if (window === "full" && arg(1) != null && chunk == null) {
      console.error(`full chunk 1..${FULL_CHUNK_COUNT} olmalı`);
      process.exit(1);
    }
    if (window === "full" && chunk != null) {
      console.log("chunk", fullChunkRange(chunk));
    }
    const started = await startScrappaWindow(window, {
      chunk,
      force: process.argv.includes("--force"),
    });
    console.log("start", started);
    if (!started.ok) process.exit(1);
    await drain(true);
    return;
  }

  if (cmd === "drain") {
    // cron */4 ve elle: canlı pid varsa çık. Kalp atışı / mola / yavaş istek ikinci açmaz.
    // Kilit yoksa ve DB'de running iş varsa ölü işçiyi tek başına devral.
    const other = otherLiveWorkerPid(lane);
    if (other != null) {
      console.log(`drain: işçi zaten var pid=${other} — çık`);
      return;
    }
    const admin = createAdminClient();
    const deals = admin ? (await readScanBoard(admin)).deals : null;
    const job = jobFromPayload(deals);
    const rematch = rematchJobFromPayload(deals);
    const running =
      (job?.status === "running" && !job.halted) || rematch?.status === "running";
    if (!running && !process.argv.includes("--force")) {
      console.log("drain: devam edecek iş yok");
      return;
    }
    claimWorkerOrExit("drain", lane);
    console.log("drain: tek işçi devraldı");
    await drain(true);
    return;
  }

  if (cmd === "rematch") {
    claimWorkerOrExit("rematch", lane);
    const admin = createAdminClient();
    if (!admin) {
      console.error("SUPABASE_SERVICE_ROLE_KEY yok");
      process.exit(1);
    }
    const deals = (await readScanBoard(admin)).deals;
    const job = jobFromPayload(deals);
    const existing = rematchJobFromPayload(deals);
    if (existing?.status === "running") {
      console.log("rematch: kaldığı yerden", {
        phase: existing.phase,
        dest: existing.destIndex,
      });
    } else if (job?.status === "running" && !job.halted) {
      console.log("rematch skip — tek yön kaldığı yerden", {
        window: job.window,
        dest: job.destIndex,
      });
    } else {
      const started = await startRematchJob(admin, {
        force: true,
        notify: true,
      });
      console.log("rematch start", started);
      if (!started.ok) process.exit(1);
    }
    await drain(true);
    return;
  }

  console.error(
    "kullanım: a|b start day | a|b start near|full [chunk] | a|b stop | a|b drain | a|b rematch | cutoff | crontab",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
