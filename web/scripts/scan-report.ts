import { createClient } from "@supabase/supabase-js";
import { fullChunksForWeekday, fullChunkRange } from "../src/lib/scan/scrappa-schedule.ts";
import { SCRAPPA_DESTINATIONS } from "../src/lib/scan/scrappa-targets.ts";
import { isLiveDeal } from "../src/lib/scan/deal-archive.ts";
import { dealDestCode, vitrinHeroDeals, dealWithinStopLimit, isUnverifiedOneWaySum } from "../src/lib/deal-display.ts";
import type { Deal, ScrappaJob } from "../src/lib/types.ts";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("scan_board")
    .select("deals, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;

  const payload = data?.deals as {
    deals?: Deal[];
    scrappaJob?: ScrappaJob;
    fetchedAt?: string;
  } | null;
  const job = payload?.scrappaJob;
  const now = new Date();
  const [a, b] = fullChunksForWeekday(now);
  const ra = fullChunkRange(a);
  const rb = fullChunkRange(b);

  console.log("=== TARİH (TR) ===");
  console.log(
    new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "full",
      timeStyle: "short",
    }).format(now),
  );
  console.log(`Bugün full dilimler: ${a}+${b} → ${ra.codes.join(",")} sonra ${rb.codes.join(",")}`);
  console.log("board updated_at:", data?.updated_at);
  console.log("deals fetchedAt:", payload?.fetchedAt);

  console.log("\n=== SCRAPPA JOB ===");
  if (!job) {
    console.log("scrappaJob yok");
  } else {
    console.log(JSON.stringify(job, null, 2));
    const dest =
      job.window === "full" && typeof job.destIndex === "number"
        ? SCRAPPA_DESTINATIONS[job.destIndex]?.code
        : SCRAPPA_DESTINATIONS[job.destIndex]?.code;
    console.log("cursor dest:", dest ?? "?", "dateIndex:", job.dateIndex, "leg:", job.legIndex);
    const hbAge = (Date.now() - Date.parse(job.heartbeatAt)) / 60000;
    console.log(`heartbeat yaşı: ${hbAge.toFixed(1)} dk`);
    if (job.pausedUntil) {
      const left = (Date.parse(job.pausedUntil) - Date.now()) / 1000;
      console.log(`pausedUntil: ${job.pausedUntil} (kalan ~${left.toFixed(0)}s)`);
    }
  }

  const deals = payload?.deals ?? [];
  const live = vitrinHeroDeals(
    deals.filter((d) => isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d)),
  );
  const scrappaLive = live.filter(
    (d) =>
      d.id.startsWith("scrappa:") ||
      d.dateOptions?.some((o) => o.source === "scrappa") ||
      (!d.id.startsWith("gdeals:") && !d.id.startsWith("manual:") && d.verifiedAt),
  );
  const withVerified = live.filter((d) => Boolean(d.verifiedAt));
  const todayTR = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(now);

  const foundToday = live.filter((d) => (d.foundAt || "").slice(0, 10) === todayTR);
  const verifiedToday = live.filter((d) => (d.verifiedAt || "").slice(0, 10) === todayTR);

  console.log("\n=== VİTRİN ===");
  console.log(`canlı kart: ${live.length}`);
  console.log(`verifiedAt olan: ${withVerified.length}`);
  console.log(`bugün foundAt: ${foundToday.length}`);
  console.log(`bugün verifiedAt: ${verifiedToday.length}`);
  console.log(
    "kaynak örnek:",
    live.slice(0, 15).map((d) => `${dealDestCode(d)}:${d.id.split(":")[0]}`),
  );

  // Halt flags from env if readable
  try {
    const halt = await import("../src/lib/scan/halt.ts");
    console.log("\n=== HALT ===");
    console.log("SCRAPPA_HALTED?", (halt as { SCRAPPA_HALTED?: boolean }).SCRAPPA_HALTED);
    console.log("GOOGLE_DEALS_HALTED?", (halt as { GOOGLE_DEALS_HALTED?: boolean }).GOOGLE_DEALS_HALTED);
  } catch {
    /* */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
