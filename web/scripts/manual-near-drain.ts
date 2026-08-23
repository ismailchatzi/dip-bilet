/**
 * Sadece Scrappa near drain (Google atlanır — zaten koştuysa).
 * npx tsx scripts/manual-near-drain.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobFromPayload, saveScrappaJob } from "@/lib/scan/scrappa-job";
import { readScanBoard } from "@/lib/scan/board";
import { startScrappaWindow, runScrappaTick } from "@/lib/scan/scrappa-tick";

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

async function unhaltJob() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase yok");
  const board = await readScanBoard(admin);
  const job = jobFromPayload(board.deals);
  const now = new Date().toISOString();
  if (job?.halted) {
    await saveScrappaJob(admin, {
      ...job,
      halted: false,
      status: "idle",
      queue: [],
      heartbeatAt: now,
      lastError: undefined,
    });
    console.log("job unhalted");
  }
}

async function drainNear() {
  for (;;) {
    const result = await runScrappaTick(true);
    console.log(
      new Date().toISOString(),
      JSON.stringify({
        running: result.running,
        paused: "paused" in result ? result.paused : false,
        dest: "dest" in result ? result.dest : undefined,
        scanned: "scanned" in result ? result.scanned : undefined,
        saved: "saved" in result ? result.saved : undefined,
        skipped: "skipped" in result ? result.skipped : undefined,
        lastError: "lastError" in result ? result.lastError : undefined,
      }),
    );
    if (!result.running) return;
    if ("paused" in result && result.paused) {
      const pausedUntil =
        "pausedUntil" in result && typeof result.pausedUntil === "string"
          ? result.pausedUntil
          : undefined;
      const wait = pausedUntil
        ? Date.parse(pausedUntil) - Date.now()
        : 20_000;
      await sleep(Math.max(5_000, wait));
      continue;
    }
    await sleep(250);
  }
}

async function main() {
  loadEnv();
  await unhaltJob();
  const started = await startScrappaWindow("near", { force: true });
  console.log("start", started);
  if (!started.ok) process.exit(1);
  await drainNear();
  const admin = createAdminClient();
  if (admin) {
    const board = await readScanBoard(admin);
    console.log("vitrin kartı:", board.deals?.deals?.length ?? 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
