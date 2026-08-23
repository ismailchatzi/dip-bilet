/**
 * Scrappa full (22–180 gün) start + drain.
 * npx tsx scripts/manual-full-drain.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
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

async function drain() {
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
  const started = await startScrappaWindow("full", { force: true });
  console.log("start", started);
  if (!started.ok) process.exit(1);
  await drain();
  const admin = createAdminClient();
  if (admin) {
    const board = await readScanBoard(admin);
    const deals = board.deals?.deals ?? [];
    const g = deals.filter((d) => d.id.startsWith("gdeals:")).length;
    const s = deals.filter((d) => d.id.startsWith("scrappa:")).length;
    console.log("bitti — vitrin toplam", deals.length, "google", g, "scrappa", s);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
