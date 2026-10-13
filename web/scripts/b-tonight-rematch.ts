/**
 * Tek seferlik (14 Eki 2026 gecesi): B'nin 2. full'ünü (4. dilim) yarıda kes,
 * 3.+4. dilim doğrulamasını otomatik zincirle aynı ayarlarla başlat.
 * Takvime dokunmaz: 03:55 cutoff / 04:01 b start day eskisi gibi.
 *
 * npx tsx scripts/b-tonight-rematch.ts --dry   → yalnız ne yapacağını yazar
 * npx tsx scripts/b-tonight-rematch.ts         → uygular; cron b drain ≤4 dk içinde devralır
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { jobFromPayload, stopScrappaJob } from "@/lib/scan/scrappa-job";
import { rematchJobFromPayload, startRematchJob } from "@/lib/scan/scrappa-rematch";
import { obsWindowForFullPair } from "@/lib/scan/scrappa-horizon";
import { fullChunkRange } from "@/lib/scan/scrappa-schedule";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import { otherLiveWorkerPid, stopLockedWorker } from "@/lib/scan/scrappa-worker-lock";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (key && process.env[key] === undefined) process.env[key] = line.slice(i + 1).trim();
    }
  }
}

function turkeyMinute() {
  const tr = new Date(Date.now() + 3 * 3600_000);
  return tr.getUTCHours() * 60 + tr.getUTCMinutes();
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry");
  const minute = turkeyMinute();
  if (minute >= 3 * 60 + 30 && minute < 4 * 60 + 30) {
    console.log("03:30–04:30 arası çalışmaz (cutoff / yeni gün) — çıkış");
    return;
  }
  const bound = bindLaneApiKey("b");
  if (!bound.ok) throw new Error(bound.error);
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin yok");

  const deals = (await readScanBoard(admin)).deals;
  const job = jobFromPayload(deals, "b");
  const rematch = rematchJobFromPayload(deals);
  if (!job || job.window !== "full" || job.chunk !== 4 || job.partnerChunk !== 3) {
    console.log("B işi beklenen durumda değil (full 4. dilim, partner 3) — dokunulmadı", {
      status: job?.status,
      window: job?.window,
      chunk: job?.chunk,
      partnerChunk: job?.partnerChunk,
    });
    return;
  }
  if (job.status !== "running") {
    console.log("B tek yön zaten çalışmıyor — dokunulmadı", { status: job.status, lastError: job.lastError });
    return;
  }
  if (rematch?.status === "running") {
    console.log("B rematch zaten çalışıyor — dokunulmadı", { phase: rematch.phase, dest: rematch.destIndex });
    return;
  }

  const destCodes = [...fullChunkRange(3).codes, ...fullChunkRange(4).codes];
  const partnerStart = job.partnerStartedAt
    ? { startedAt: job.partnerStartedAt }
    : { startedAt: new Date(`${job.startedAt.slice(0, 10)}T01:00:00Z`).toISOString() };
  const obs = obsWindowForFullPair(job, partnerStart);

  console.log("B şu an", {
    dest: job.destIndex,
    dateIndex: job.dateIndex,
    scanned: job.scanned,
    saved: job.saved,
    startedAt: job.startedAt,
    partnerStartedAt: job.partnerStartedAt,
  });
  console.log("doğrulama", { destCodes, obs });
  if (dry) {
    console.log("--dry: hiçbir şey değişmedi");
    return;
  }

  stopLockedWorker("b");
  await new Promise((r) => setTimeout(r, 3_000));
  const still = otherLiveWorkerPid("b");
  if (still != null) {
    console.log(`B işçisi kapanmadı pid=${still} — iş durumu değiştirilmedi`);
    return;
  }

  await stopScrappaJob(admin, "elle: 14 Eki gecesi BEG yarıda, AMS iptal — doğrulamaya geçildi");
  const started = await startRematchJob(admin, {
    force: true,
    notify: true,
    destCodes,
    partnerChunk: 3,
    obs,
  });
  console.log("B rematch", started.ok ? "başladı" : started.skipped);
  console.log("cron b drain ≤4 dk içinde devralır; 03:55 cutoff normal çalışır");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
