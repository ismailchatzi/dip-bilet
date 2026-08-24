/**
 * Netlify dışı Scrappa taraması. VPS'te (Hetzner CX22 yeter):
 *   cd web && npm i && npx tsx scripts/scrappa-worker.ts start near
 * Saatler (Europe/Istanbul): 07:00 start full | 15:00 ve 22:00 start near
 * Crontab örneği (TZ=Europe/Istanbul):
 *   0 7 * * *  cd /path/web && npx tsx scripts/scrappa-worker.ts start full
 *   0 15 * * * cd /path/web && npx tsx scripts/scrappa-worker.ts start near
 *   0 22 * * * cd /path/web && npx tsx scripts/scrappa-worker.ts start near
 * Yedek */5 drain KULLANMA — start zaten drain eder; ikinci process aynı
 * sorguları tekrarlar (kota yanar).
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCRAPPA_API_KEY
 * Netlify scrappa cron'ları VPS ayağa kalkınca kapat (çift tarama olmasın).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  runScrappaTick,
  startScrappaWindow,
} from "@/lib/scan/scrappa-tick";
import { publishAllShowcase } from "@/lib/scan/scrappa-match";
import { createAdminClient } from "@/lib/supabase/admin";
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

async function drain() {
  for (;;) {
    // force=false: başka drain çalışıyorsa (heartbeat taze) ikinci process
    // aynı bacağı tekrar çekmesin — */5 yedek + start çakışması kotayı yakıyordu.
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
    await sleep(250);
  }
}

async function main() {
  loadEnv();
  const cmd = process.argv[2] ?? "drain";
  if (cmd === "start") {
    const window = parseWindow(process.argv[3]);
    if (!window) {
      console.error("kullanım: npx tsx scripts/scrappa-worker.ts start near|full");
      process.exit(1);
    }
    const started = await startScrappaWindow(window);
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
    // rematch vitrin fiyatlarını tazeler; bildirim isteniyorsa kapatmıyoruz
    const result = await publishAllShowcase(admin, { notify: true });
    console.log("rematch done", result);
    return;
  }
  console.error("kullanım: start near|full  |  drain  |  rematch");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
