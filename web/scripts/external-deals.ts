/**
 * Dış kaynak fırsat toplayıcı — İstanbul kalkışlı ilanları okur, external_deals'a yazar.
 * Tarama hatlarına / kilitlerine dokunmaz; Scrappa kullanmaz.
 *
 * npx tsx scripts/external-deals.ts           → zamanı gelen kaynakları oku + kaydet
 * npx tsx scripts/external-deals.ts --force   → zamanlamayı yok say
 * npx tsx scripts/external-deals.ts --dry     → yalnız ekrana bas (DB / durum dosyası yazılmaz)
 * npx tsx scripts/external-deals.ts --only=fly4free → tek kaynak
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { forgetFeedVersion, isBlocked } from "@/lib/external/http";
import { knownSourceIds, saveExternalDeals } from "@/lib/external/store";
import type { CollectorState, ExternalDeal, SourceState } from "@/lib/external/types";
import { FARETUS_SOURCE, readFaretus } from "@/lib/external/faretus";
import { FLY4FREE_SOURCE, readFly4free } from "@/lib/external/fly4free";
import { SECRETFLYING_SOURCE, readSecretFlying } from "@/lib/external/secretflying";
import { TELEGRAM_SOURCE, readTelegram } from "@/lib/external/telegram";
import { UCUZAUCAK_SOURCE, readUcuzaucak } from "@/lib/external/ucuzaucak";

const STATE_FILE = resolve(process.cwd(), ".external-deals-state.json");

type Reader = (
  state: SourceState,
  isKnown: (ids: string[]) => Promise<Set<string>>,
) => Promise<{ deals: ExternalDeal[]; note: string }>;

const SOURCES: { name: string; read: Reader; dayMin: [number, number]; nightMin: number }[] = [
  { name: UCUZAUCAK_SOURCE, read: readUcuzaucak, dayMin: [2, 4], nightMin: 15 },
  { name: FLY4FREE_SOURCE, read: readFly4free, dayMin: [5, 8], nightMin: 15 },
  { name: SECRETFLYING_SOURCE, read: readSecretFlying, dayMin: [10, 15], nightMin: 30 },
  { name: FARETUS_SOURCE, read: readFaretus, dayMin: [10, 15], nightMin: 30 },
  { name: TELEGRAM_SOURCE, read: readTelegram, dayMin: [2, 4], nightMin: 15 },
];

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

function loadState(): CollectorState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as CollectorState;
  } catch {
    return {};
  }
}

function turkeyHour(now: Date) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(now),
  );
}

/** Gündüz [min,max] dk arası rastgele; 01:00–07:00 TR seyrek. */
function nextRunAt(now: Date, dayMin: [number, number], nightMin: number) {
  const hour = turkeyHour(now);
  const minutes =
    hour >= 1 && hour < 7 ? nightMin : dayMin[0] + Math.random() * (dayMin[1] - dayMin[0]);
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function describe(d: ExternalDeal) {
  const pairs = d.datePairs;
  const sample = pairs
    .slice(0, 4)
    .map((p) => `${p.out.slice(5)}${p.ret ? `→${p.ret.slice(5)}` : ""}`)
    .join(", ");
  const tl = d.details.priceTry != null ? ` (${d.details.priceTry} TL)` : "";
  const lines = [
    `  • ${d.title}`,
    `    ${d.origin ?? "?"} → ${d.destCode ?? "?"} · ${d.price ?? "?"} ${d.currency ?? ""}${tl} · ${d.tripType ?? "?"} · aktarma ${d.stops ?? "?"}`,
    `    tarih çifti ${pairs.length}${sample ? `: ${sample}${pairs.length > 4 ? " …" : ""}` : ""}`,
  ];
  if (d.details.route) lines.push(`    rota: ${d.details.route}`);
  if (d.details.travelDates) lines.push(`    tarihler: ${d.details.travelDates}`);
  if (d.details.destName) {
    const status = d.details.detailStatus ? ` · detay ${d.details.detailStatus}` : "";
    lines.push(`    varış: ${d.details.destName}${status}`);
  }
  if (d.details.travelFrom) lines.push(`    pencere: ${d.details.travelFrom} → ${d.details.travelTo ?? "?"}`);
  if (!pairs.length && d.details.out) lines.push(`    tarih (kodsuz): ${d.details.out} → ${d.details.ret ?? "tek yön"}`);
  if (d.details.rating) lines.push(`    kanal notu: ${d.details.rating} · ${d.details.nights ?? "?"} gece`);
  if (d.details.dates) lines.push(`    tarihler: ${String(d.details.dates).replace(/\n/g, " / ").slice(0, 200)}`);
  return lines.join("\n");
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry");
  const force = process.argv.includes("--force") || dry;
  const admin = dry ? null : createAdminClient();
  if (!dry && !admin) {
    console.error("Supabase yok");
    process.exit(1);
  }
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const state = loadState();
  const now = new Date();

  for (const src of SOURCES) {
    if (only && src.name !== only) continue;
    const st = (state[src.name] ??= {});
    if (isBlocked(st, now)) {
      console.log(`${src.name}: engelli, ${st.blockedUntil} kadar bekleniyor`);
      continue;
    }
    if (!force && st.nextAt && new Date(st.nextAt) > now) continue;

    const isKnown = admin
      ? (ids: string[]) => knownSourceIds(admin, src.name, ids)
      : async () => new Set<string>();
    const { deals, note } = await src.read(st, isKnown);
    st.nextAt = nextRunAt(now, src.dayMin, src.nightMin);
    console.log(`${now.toISOString()} ${src.name}: ${note}`);
    for (const d of deals) console.log(describe(d));

    if (admin && deals.length) {
      const saved = await saveExternalDeals(admin, deals);
      if (!saved.ok) forgetFeedVersion(st);
      console.log(saved.ok ? `  kaydedildi: ${saved.saved}` : `  kayıt hatası: ${saved.error}`);
    }
  }

  if (!dry) writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
