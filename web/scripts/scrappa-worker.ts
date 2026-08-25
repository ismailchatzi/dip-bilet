/**
 * Netlify dışı Scrappa taraması. VPS (TZ=Europe/Istanbul):
 *
 *   0 7 * * *   start day     — near → (nefes) RT → (nefes) booking → full → aynı
 *   30 22 * * * rematch       — güvenlik (tarama varken skip)
 *   her 5 dk      drain         — yedek devam
 *
 * One-way gap 3s. Art arda 7× oturum/503 → 15 dk pause, kaldığı yerden.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCRAPPA_API_KEY
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  runScrappaTick,
  startScrappaDay,
  startScrappaWindow,
  stopScrappaScans,
} from "@/lib/scan/scrappa-tick";
import { publishAllShowcase } from "@/lib/scan/scrappa-match";
import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { jobFromPayload } from "@/lib/scan/scrappa-job";
import {
  FULL_CHUNK_COUNT,
  SCRAPPA_REQUEST_GAP_MS,
  fullChunkForWeekday,
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
  const cmd = process.argv[2] ?? "drain";

  if (cmd === "crontab") {
    for (const line of scrappaCrontabLines()) console.log(line);
    return;
  }

  if (cmd === "stop") {
    const stopped = await stopScrappaScans(
      process.argv[3] ?? "worker stop — eski takvim iptal",
    );
    console.log("stop", stopped);
    return;
  }

  if (cmd === "start") {
    const mode = process.argv[3];
    if (mode === "day") {
      const chunk =
        parseChunk(process.argv[4]) ?? fullChunkForWeekday();
      console.log("day chunk", fullChunkRange(chunk));
      const started = await startScrappaDay({
        force: process.argv.includes("--force"),
        chunk,
      });
      console.log("start day", started);
      if (!started.ok) process.exit(1);
      await drain(true);
      return;
    }

    const window = parseWindow(mode);
    if (!window) {
      console.error(
        "kullanım: start day [chunk] | start near|full [chunk] | stop | drain | rematch | crontab",
      );
      process.exit(1);
    }
    const chunk =
      window === "full" ? parseChunk(process.argv[4]) : undefined;
    if (window === "full" && process.argv[4] != null && chunk == null) {
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
    // nohup / elle devam: --force (kendi heartbeat kilidine takılma)
    // cron */5: force yok — başka start day drain varken çakışmaz
    await drain(process.argv.includes("--force"));
    return;
  }

  if (cmd === "rematch") {
    const admin = createAdminClient();
    if (!admin) {
      console.error("SUPABASE_SERVICE_ROLE_KEY yok");
      process.exit(1);
    }
    const job = jobFromPayload((await readScanBoard(admin)).deals);
    if (job?.status === "running" && !job.halted) {
      console.log("rematch skip — tarama sürüyor", {
        window: job.window,
        dest: job.destIndex,
        scanned: job.scanned,
      });
      return;
    }
    const result = await publishAllShowcase(admin, { notify: true });
    console.log("rematch done", result);
    return;
  }

  console.error(
    "kullanım: start day [chunk] | start near|full [chunk] | stop | drain | rematch | crontab",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
