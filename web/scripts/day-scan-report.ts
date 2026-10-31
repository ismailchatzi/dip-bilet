/**
 * Günlük tarama raporu — A/B + rematch + vitrin + uzak hat + dış kaynak.
 * npx tsx scripts/day-scan-report.ts
 * npx tsx scripts/day-scan-report.ts 2026-10-18
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { jobFromPayload } from "@/lib/scan/scrappa-job";
import { rematchJobFromPayload } from "@/lib/scan/scrappa-rematch";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";
import {
  fullChunksForWeekday,
  fullChunkRange,
} from "@/lib/scan/scrappa-schedule";
import {
  vitrinHeroDeals,
  dealDestCode,
  dealWithinStopLimit,
  isUnverifiedOneWaySum,
} from "@/lib/deal-display";
import { isLiveDeal } from "@/lib/scan/deal-archive";
import {
  REMOTE_GROUPS,
  remoteAirports,
  remoteGroupForDay,
} from "@/lib/scan/remote-targets";
import { hardFloorUsd } from "@/lib/scan/showcase-config";
import { horizonDates } from "@/lib/scan/scrappa-horizon";
import type { SupabaseClient } from "@supabase/supabase-js";

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

function ageMin(iso?: string) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 60_000);
}

/** TR günü YYYY-MM-DD → UTC gözlem penceresi (uzak hat ertesi 03:30’a kadar sürebilir). */
function trDayWindows(dayTR: string) {
  const startMs = Date.parse(`${dayTR}T00:00:00+03:00`);
  const nextMs = startMs + 86_400_000;
  const nextTR = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date(nextMs));
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(nextMs).toISOString(),
    remoteTo: new Date(`${nextTR}T03:30:00+03:00`).toISOString(),
  };
}

async function reportRemote(admin: SupabaseClient, dayTR: string) {
  const group = remoteGroupForDay(dayTR);
  console.log("\n=== UZAK HAT ===");
  if (!group) {
    console.log("uzak hat bu gün yok (başlangıç öncesi)");
    return;
  }
  const cities = REMOTE_GROUPS[group];
  const datesLen = horizonDates("full").length;
  console.log({
    group,
    cities: cities.map((d) => d.code),
    expectedPerAirport: datesLen * 2,
  });

  const { from, remoteTo } = trDayWindows(dayTR);
  const byCity: Record<
    string,
    { n: number; expected: number; complete: boolean; first?: string; last?: string }
  > = {};

  for (const dest of cities) {
    const airports = remoteAirports(dest);
    const { count, error } = await admin
      .from("price_observations")
      .select("*", { count: "exact", head: true })
      .gte("observed_at", from)
      .lt("observed_at", remoteTo)
      .eq("source", "scrappa_oneway")
      .eq("destination_code", dest.code);
    if (error) {
      console.log(dest.code, "obs hata", error.message);
      continue;
    }
    const expected = datesLen * 2 * airports.length;
    const { data: first } = await admin
      .from("price_observations")
      .select("observed_at")
      .gte("observed_at", from)
      .lt("observed_at", remoteTo)
      .eq("source", "scrappa_oneway")
      .eq("destination_code", dest.code)
      .order("observed_at", { ascending: true })
      .limit(1);
    const { data: last } = await admin
      .from("price_observations")
      .select("observed_at")
      .gte("observed_at", from)
      .lt("observed_at", remoteTo)
      .eq("source", "scrappa_oneway")
      .eq("destination_code", dest.code)
      .order("observed_at", { ascending: false })
      .limit(1);
    const n = count ?? 0;
    byCity[dest.code] = {
      n,
      expected,
      complete: n >= expected * 0.95,
      first: first?.[0]?.observed_at as string | undefined,
      last: last?.[0]?.observed_at as string | undefined,
    };
  }

  const board = await readScanBoard(admin);
  const live = vitrinHeroDeals(
    (board.deals?.deals ?? []).filter(
      (x) =>
        isLiveDeal(x) && dealWithinStopLimit(x) && !isUnverifiedOneWaySum(x),
    ),
  );
  const remoteCodes = new Set(cities.map((d) => d.code));
  const remoteLive = live.filter((d) => remoteCodes.has(dealDestCode(d)));

  console.log("şehirler:", byCity);
  console.log(
    "vitrin uzak:",
    remoteLive.map(
      (d) =>
        `${dealDestCode(d)}:${d.id.split(":")[0]}:$${d.price}:f=${d.foundAt}`,
    ),
  );
  const done = Object.values(byCity).filter((v) => v.complete).length;
  console.log(`özet: ${done}/${cities.length} şehir one-way tamam (≥%95)`);
}

async function reportExternal(admin: SupabaseClient, dayTR: string) {
  console.log("\n=== DIŞ KAYNAK ===");
  const { from, to } = trDayWindows(dayTR);
  const { data: neu, error } = await admin
    .from("external_deals")
    .select("id, source, dest_code, price, first_seen_at, details, trip_type")
    .gte("first_seen_at", from)
    .lt("first_seen_at", to)
    .order("first_seen_at", { ascending: false });
  if (error) {
    console.log("external okunamadı", error.message);
    return;
  }

  const bySource: Record<string, number> = {};
  let verifyOk = 0;
  let verifyFail = 0;
  let verifyNone = 0;
  for (const r of neu ?? []) {
    bySource[String(r.source)] = (bySource[String(r.source)] ?? 0) + 1;
    const v = (r.details as { verify?: { status?: string } } | null)?.verify;
    if (v?.status === "ok") verifyOk += 1;
    else if (v?.status === "fail") verifyFail += 1;
    else verifyNone += 1;
  }

  const board = await readScanBoard(admin);
  const live = vitrinHeroDeals(
    (board.deals?.deals ?? []).filter(
      (x) =>
        isLiveDeal(x) && dealWithinStopLimit(x) && !isUnverifiedOneWaySum(x),
    ),
  );
  const extLive = live.filter((d) => d.id.startsWith("external:"));
  const extToday = extLive.filter(
    (d) =>
      (d.foundAt || "").slice(0, 10) === dayTR ||
      (d.verifiedAt || "").slice(0, 10) === dayTR,
  );

  const { data: recent } = await admin
    .from("external_deals")
    .select("dest_code, details, trip_type, price")
    .eq("trip_type", "rt")
    .not("price", "is", null)
    .order("first_seen_at", { ascending: false })
    .limit(80);
  let backlog = 0;
  let esikYok = 0;
  for (const r of recent ?? []) {
    const v = (
      r.details as { verify?: { status?: string; attempts?: number } } | null
    )?.verify;
    if (v?.status === "ok") continue;
    if ((v?.attempts ?? 0) >= 3) continue;
    backlog += 1;
    const code = String(r.dest_code || "").toUpperCase();
    if (code && hardFloorUsd(code) == null) esikYok += 1;
  }

  console.log({
    bugünYeniİlan: neu?.length ?? 0,
    bySource,
    verify: { ok: verifyOk, fail: verifyFail, yok: verifyNone },
    vitrinExternal: extLive.length,
    bugünExternalKart: extToday.map((d) => `${dealDestCode(d)}:$${d.price}`),
    backlogSon80: backlog,
    backlogEsikYokTahmini: esikYok,
  });
}

async function main() {
  loadEnv();
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    process.exit(1);
  }

  const argDay = process.argv[2]?.trim();
  const now = argDay ? new Date(`${argDay}T12:00:00+03:00`) : new Date();
  const todayTR =
    argDay && /^\d{4}-\d{2}-\d{2}$/.test(argDay)
      ? argDay
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Istanbul",
        }).format(now);
  const [c1, c2] = fullChunksForWeekday(now);
  console.log("=== GÜN ===");
  console.log(
    new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date()),
    argDay ? `(rapor günü ${todayTR})` : "",
  );
  console.log(
    `full dilimler: ${c1}+${c2} → ${fullChunkRange(c1).codes.join(",")} sonra ${fullChunkRange(c2).codes.join(",")}`,
  );

  for (const lane of ["a", "b"] as const) {
    bindLaneApiKey(lane);
    const board = await readScanBoard(admin);
    const d = board.deals;
    const j = jobFromPayload(d);
    const r = rematchJobFromPayload(d);

    console.log(`\n=== HAT ${lane.toUpperCase()} ===`);
    if (!j) console.log("oneWay: yok");
    else {
      console.log("oneWay:", {
        status: j.status,
        window: j.window,
        chunk: j.chunk,
        dest: SCRAPPA_DESTINATIONS[j.destIndex]?.code,
        destIndex: j.destIndex,
        dateIndex: j.dateIndex,
        legIndex: j.legIndex,
        scanned: j.scanned,
        saved: j.saved,
        lastError: j.lastError,
        pausedUntil: j.pausedUntil,
        streak: j.sessionFailStreak,
        queue: j.queue,
        partnerChunk: j.partnerChunk,
        skipRematch: j.skipRematch,
        startedAt: j.startedAt,
        hbMinAgo: ageMin(j.heartbeatAt),
      });
    }
    if (!r) console.log("rematch: yok");
    else {
      const pendingKeys = r.pendingByDest
        ? Object.keys(r.pendingByDest).filter(
            (k) => (r.pendingByDest?.[k]?.length ?? 0) > 0,
          )
        : [];
      console.log("rematch:", {
        status: r.status,
        phase: r.phase,
        dest: SCRAPPA_DESTINATIONS[r.destIndex]?.code ?? `idx${r.destIndex}`,
        destIndex: r.destIndex,
        bookingItemIndex: r.bookingItemIndex,
        lastError: r.lastError,
        streak: r.sessionFailStreak,
        pausedUntil: r.pausedUntil,
        obs: r.obs,
        rtAttempt: r.rtVerifyAttempt,
        pendingCities: pendingKeys,
        continueQueue: r.continueQueue,
        startedAt: r.startedAt,
        heartbeatAt: r.heartbeatAt,
        hbMinAgo: ageMin(r.heartbeatAt),
      });
    }

    if (lane === "a") {
      const deals = d?.deals ?? [];
      const live = vitrinHeroDeals(
        deals.filter(
          (x) =>
            isLiveDeal(x) &&
            dealWithinStopLimit(x) &&
            !isUnverifiedOneWaySum(x),
        ),
      );
      const scrappa = live.filter(
        (x) =>
          x.id.startsWith("scrappa:") ||
          x.dateOptions?.some((o) => o.source === "scrappa") ||
          (!x.id.startsWith("gdeals:") &&
            !x.id.startsWith("manual:") &&
            !x.id.startsWith("external:") &&
            Boolean(x.verifiedAt)),
      );
      const foundToday = live.filter(
        (x) => (x.foundAt || "").slice(0, 10) === todayTR,
      );
      const verToday = live.filter(
        (x) => (x.verifiedAt || "").slice(0, 10) === todayTR,
      );
      console.log("\n=== VİTRİN ===");
      console.log({
        canlı: live.length,
        scrappaBenzeri: scrappa.length,
        bugünFound: foundToday.length,
        bugünVerified: verToday.length,
        örnek: live.slice(0, 24).map(
          (x) => `${dealDestCode(x)}:${x.id.split(":")[0]}:$${x.price}`,
        ),
      });
      const sessionish = [j?.lastError, r?.lastError]
        .filter(Boolean)
        .join(" ");
      console.log("\n=== OTURUM İPUCU ===");
      console.log(
        /cookie_session|oturum|request_exhausted/i.test(sessionish)
          ? `oturum/exhausted izi: ${sessionish}`
          : sessionish
            ? `lastError: ${sessionish}`
            : "cookie_session yok (job lastError temiz veya genel)",
      );
    }
  }

  await reportRemote(admin, todayTR);
  await reportExternal(admin, todayTR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
