/**
 * Netlify dışı Scrappa taraması. VPS (TZ=Europe/Istanbul):
 *
 *   0 0 * * *   start full 1
 *   30 2 * * *  start full 2
 *   0 5 * * *   start full 3
 *   30 7 * * *  start full 4
 *   0 10 * * *  start full 5
 *   30 12 * * * start near
 *   0 15 * * *  start full 6
 *   30 17 * * * start full 7
 *   0 20 * * *  start near
 *   30 22 * * * rematch
 *
 * Yedek 5-dk drain KULLANMA. İstek arası 2sn; oturum düşünce ~45dk pause.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCRAPPA_API_KEY
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  runScrappaTick,
  startScrappaWindow,
} from "@/lib/scan/scrappa-tick";
import { publishAllShowcase } from "@/lib/scan/scrappa-match";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FULL_CHUNK_COUNT,
  SCRAPPA_REQUEST_GAP_MS,
  fullChunkRange,
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

async function drain() {
  for (;;) {
    const result = await runScrappaTick(false);
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
  if (cmd === "start") {
    const window = parseWindow(process.argv[3]);
    if (!window) {
      console.error(
        "kullanım: npx tsx scripts/scrappa-worker.ts start near|full [chunk 1-7]",
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
    const started = await startScrappaWindow(window, { chunk });
    console.log("start", started);
    if (!started.ok) process.exit(1);
    await drain();
    return;
  }
  if (cmd === "drain") {
    await drain();
    return;
  }
  if (cmd === "rematch") {
    const admin = createAdminClient();
    if (!admin) {
      console.error("SUPABASE_SERVICE_ROLE_KEY yok");
      process.exit(1);
    }
    const result = await publishAllShowcase(admin, { notify: true });
    console.log("rematch done", result);
    return;
  }
  console.error("kullanım: start near|full [1-7]  |  drain  |  rematch");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
