/**
 * Uzun yol testi — tarama mantığıyla: tek yön gidiş + dönüş günleri taranır,
 * en ucuz sentetik kombinasyonlar (≥7 gece) gidiş-dönüş paketle doğrulanır.
 * Yalnız VPS'te, hatlar boşken: A kilidini alır (dış kaynak doğrulaması o sırada bekler).
 *
 * npx tsx scripts/test-longhaul-rt.ts JFK 2026-12-01 2026-12-31
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrappaOneWay, scrappaRoundTrip, ScrappaUnavailableError } from "@/lib/providers/scrappa";
import { readScanBoard } from "@/lib/scan/board";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import { acquireWorkerLock } from "@/lib/scan/scrappa-worker-lock";
import { addDaysIso } from "@/lib/scan/trip-rules";

const MIN_STAY = 7;
const MAX_STAY = 14;
const CANDIDATES = 5;
const GAP_MS = 2000;

for (const name of [".env.local", ".env"]) {
  const file = resolve(process.cwd(), name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function trMinute() {
  const d = new Date(Date.now() + 3 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function days(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

function nights(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

async function main() {
  const [dest = "JFK", outFrom = "2026-12-01", outTo = "2026-12-31"] = process.argv.slice(2);
  const minute = trMinute();
  if (minute >= 4 * 60 + 15 && minute < 11 * 60 + 30) {
    console.log("04:15–11:30 arası tarama saatleri — test yok");
    return;
  }
  const admin = createAdminClient()!;
  const board = (await readScanBoard(admin)).deals;
  const running = [board?.scrappaJob, board?.scrappaRematchJob, board?.scrappaJobB, board?.scrappaRematchJobB]
    .some((j) => j?.status === "running");
  if (running) {
    console.log("Tarama hattı çalışıyor — test yok");
    return;
  }
  const bound = bindLaneApiKey("a");
  if (!bound.ok) throw new Error(bound.error);
  const lock = acquireWorkerLock("a");
  if (!lock.ok) {
    console.log(`A kilidi dolu (pid ${lock.pid}) — biraz sonra tekrar dene`);
    return;
  }

  const outDays = days(outFrom, outTo);
  const retDays = days(addDaysIso(outFrom, MIN_STAY), addDaysIso(outTo, MAX_STAY));
  console.log(`IST→${dest}: ${outDays.length} gidiş + ${retDays.length} dönüş günü tek yön taranıyor (~${Math.round(((outDays.length + retDays.length) * 11) / 60)} dk)`);

  const go = new Map<string, { price: number; airline?: string }>();
  const back = new Map<string, { price: number; airline?: string }>();
  try {
    for (const d of outDays) {
      const r = await scrappaOneWay({ origin: "IST", destination: dest, date: d });
      if (r) go.set(d, { price: r.price, airline: r.airline });
      await sleep(GAP_MS);
    }
    for (const d of retDays) {
      const r = await scrappaOneWay({ origin: dest, destination: "IST", date: d });
      if (r) back.set(d, { price: r.price, airline: r.airline });
      await sleep(GAP_MS);
    }
  } catch (err) {
    if (err instanceof ScrappaUnavailableError) {
      console.log(`Scrappa: ${err.message} — test durdu`);
      return;
    }
    throw err;
  }

  const fmt = (m: Map<string, { price: number; airline?: string }>) =>
    [...m.entries()].sort((a, b) => a[1].price - b[1].price).slice(0, 6)
      .map(([d, v]) => `${d.slice(5)} $${v.price} ${v.airline ?? ""}`).join(" | ");
  console.log(`En ucuz gidişler: ${fmt(go)}`);
  console.log(`En ucuz dönüşler: ${fmt(back)}`);

  const combos: { out: string; ret: string; sum: number; label: string }[] = [];
  for (const [o, ov] of go) {
    for (const [r, rv] of back) {
      const n = nights(o, r);
      if (n < MIN_STAY || n > MAX_STAY) continue;
      combos.push({ out: o, ret: r, sum: ov.price + rv.price, label: `${ov.airline ?? "?"} + ${rv.airline ?? "?"}` });
    }
  }
  combos.sort((a, b) => a.sum - b.sum);
  const picked: typeof combos = [];
  const usedOut = new Set<string>();
  for (const c of combos) {
    if (picked.length >= CANDIDATES) break;
    if (usedOut.has(c.out)) continue;
    usedOut.add(c.out);
    picked.push(c);
  }

  console.log(`\nEn ucuz ${picked.length} kombinasyon (farklı gidiş günü, ${MIN_STAY}–${MAX_STAY} gece) → paket doğrulaması:`);
  for (const c of picked) {
    let rtText = "paket yok";
    try {
      const rt = await scrappaRoundTrip({ origin: "IST", destination: dest, departureDate: c.out, returnDate: c.ret });
      if (rt) {
        const diff = Math.round(((c.sum - rt.price) / rt.price) * 100);
        rtText = `paket $${rt.price} (${rt.airline ?? "?"}) — tek yön toplamı paketten %${diff} ${diff >= 0 ? "pahalı" : "ucuz"}`;
      }
    } catch (err) {
      if (err instanceof ScrappaUnavailableError) {
        console.log(`Scrappa: ${err.message} — test durdu`);
        return;
      }
      throw err;
    }
    console.log(`  ${c.out} → ${c.ret} (${nights(c.out, c.ret)} gece): tek yön $${c.sum} (${c.label}) | ${rtText}`);
    await sleep(15_000);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
