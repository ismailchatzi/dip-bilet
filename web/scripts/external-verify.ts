/**
 * Dış kaynak fırsatlarını (external_deals) Scrappa gidiş-dönüşle doğrular;
 * fiyat tutarsa vitrine kaynağın tam fiyatıyla E kartı olarak ekler.
 *
 * Tarama düzenine dokunmaz: A hattı (near / rematch) çalışırken, B rematch'i sürerken,
 * A işçisi canlıyken veya 03:40–04:20 TR arası hiç Scrappa çağrısı yapmaz.
 *
 * npx tsx scripts/external-verify.ts            → 15 dk cron
 * npx tsx scripts/external-verify.ts --dry      → adayları listele (Scrappa yok, yazma yok)
 * npx tsx scripts/external-verify.ts --no-write → Scrappa'ya sor, vitrine / DB'ye yazma
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalDestCode, dealDateChoices, dealDestCode, displayDealPrice } from "@/lib/deal-display";
import { buildExternalCard, publishExternalCard } from "@/lib/external/showcase";
import { istanbulCode } from "@/lib/external/pairs";
import type { ExternalDatePair } from "@/lib/external/types";
import { scrappaRoundTrip, ScrappaUnavailableError } from "@/lib/providers/scrappa";
import { readScanBoard } from "@/lib/scan/board";
import { SCRAPPA_HALTED } from "@/lib/scan/halt";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import { acquireWorkerLock, otherLiveWorkerPid } from "@/lib/scan/scrappa-worker-lock";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { DealsPayload } from "@/lib/types";

const STATE_FILE = resolve(process.cwd(), ".external-verify-state.json");
const LOOKBACK_DAYS = 14;
/** Uçuşa en az bu kadar gün kalsın (Scrappa near da 5. günden başlar). */
const MIN_LEAD_DAYS = 3;
const PAIRS_PER_ROW = 2;
const MAX_CHECKS_PER_RUN = 3;
const GAP_MS = 15_000;
const MAX_ATTEMPTS = 3;
/** Scrappa paketi kaynak fiyatının en fazla bu katı olabilir. */
const PRICE_TOLERANCE = 1.1;

type TripCheck = { status: "ok" | "fail"; at: string; scrappaUsd: number | null };
type VerifyInfo = {
  status?: "ok" | "fail";
  attempts?: number;
  sourceUsd?: number;
  cardId?: string;
  trips?: Record<string, TripCheck>;
};
type Row = {
  id: number;
  source: string;
  title: string;
  origin: string | null;
  dest_code: string | null;
  price: number | null;
  currency: string | null;
  trip_type: string | null;
  date_pairs: ExternalDatePair[];
  details: Record<string, unknown>;
};
type Trip = {
  key: string;
  origin: "IST" | "SAW";
  airport: string;
  out: string;
  ret: string;
  usd: number;
  rows: Row[];
  cityName?: string;
};

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

function loadPauseUntil(): number {
  if (!existsSync(STATE_FILE)) return 0;
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { pauseUntil?: string };
    return s.pauseUntil ? Date.parse(s.pauseUntil) || 0 : 0;
  } catch {
    return 0;
  }
}

function savePause(minutes: number, reason: string) {
  const pauseUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  writeFileSync(STATE_FILE, JSON.stringify({ pauseUntil, reason }, null, 2));
}

function turkeyMinuteOfDay(now = new Date()) {
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.getUTCHours() * 60 + tr.getUTCMinutes();
}

async function usdRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { rates?: Record<string, number> };
    return { USD: 1, ...(body.rates ?? {}) };
  } catch {
    return null;
  }
}

function toUsd(price: number, currency: string, rates: Record<string, number> | null) {
  const cur = currency.toUpperCase();
  if (cur === "USD") return price;
  const rate = rates?.[cur];
  return rate && rate > 0 ? price / rate : null;
}

function verifyOf(row: Row): VerifyInfo {
  return (row.details.verify as VerifyInfo | undefined) ?? {};
}

/**
 * Telegram mesajı havalimanını açık yazar. Diğer kaynaklarda "İstanbul" (ISTA = tüm havalimanları)
 * kayıtta IST'ye dönmüş olabilir → iki havalimanı da sorulur.
 */
function rowOrigins(row: Row, from: string): ("IST" | "SAW")[] {
  const code = istanbulCode(from);
  if (!code) return [];
  return row.source === "telegram" ? [code] : ["IST", "SAW"];
}

type RowTrip = { key: string; origin: "IST" | "SAW"; airport: string; out: string; ret: string };

function rowTrips(row: Row, minOut: string): RowTrip[] {
  const pairs = (row.date_pairs ?? [])
    .filter((p) => p.ret && p.out >= minOut && p.ret >= p.out && istanbulCode(p.from))
    .slice(0, PAIRS_PER_ROW);
  const trips: RowTrip[] = [];
  for (const p of pairs) {
    const airport = (p.to || row.dest_code || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(airport)) continue;
    for (const origin of rowOrigins(row, p.from)) {
      trips.push({ key: `${origin}|${airport}|${p.out}|${p.ret}`, origin, airport, out: p.out, ret: p.ret! });
    }
  }
  return trips;
}

/** Lane kuralı: A işi / iki rematch / A işçisi varken Scrappa'ya dokunma. */
function laneBusy(board: DealsPayload | null): string | null {
  if (board?.scrappaJob?.status === "running") return "A tek yön sürüyor";
  if (board?.scrappaRematchJob?.status === "running") return "A rematch sürüyor";
  if (board?.scrappaRematchJobB?.status === "running") return "B rematch sürüyor";
  const pid = otherLiveWorkerPid("a");
  if (pid != null) return `A işçisi canlı (pid ${pid})`;
  return null;
}

/** Vitrinde aynı tarih aynı ya da daha ucuz fiyatla zaten var mı? */
function alreadyShown(board: DealsPayload | null, trip: Trip) {
  const city = canonicalDestCode(trip.airport);
  for (const deal of board?.deals ?? []) {
    if (dealDestCode(deal) !== city) continue;
    for (const c of dealDateChoices(deal)) {
      if (c.outboundDate === trip.out && c.returnDate === trip.ret) {
        if (displayDealPrice(c.price) <= Math.round(trip.usd)) return true;
      }
    }
  }
  return false;
}

async function saveVerify(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  row: Row,
  verify: VerifyInfo,
) {
  row.details = { ...row.details, verify };
  const { error } = await admin
    .from("external_deals")
    .update({ details: row.details })
    .eq("id", row.id);
  if (error) console.warn(`external_deals #${row.id} yazılamadı: ${error.message}`);
}

async function main() {
  loadEnv();
  const args = new Set(process.argv.slice(2));
  const dry = args.has("--dry");
  const noWrite = dry || args.has("--no-write");
  const stamp = new Date().toISOString();

  if (SCRAPPA_HALTED) {
    console.log(`${stamp} Scrappa durdurulmuş — çıkış`);
    return;
  }
  const minute = turkeyMinuteOfDay();
  if (!dry && minute >= 3 * 60 + 40 && minute < 4 * 60 + 20) {
    console.log(`${stamp} 03:40–04:20 TR gün değişimi — çıkış`);
    return;
  }

  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin yok (.env.local)");

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("external_deals")
    .select("id, source, title, origin, dest_code, price, currency, trip_type, date_pairs, details")
    .gte("first_seen_at", since)
    .eq("trip_type", "rt")
    .not("price", "is", null)
    .order("first_seen_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(`external_deals okunamadı: ${error.message}`);
  const rows = (data ?? []) as Row[];

  const pending = rows.filter((r) => {
    const v = verifyOf(r);
    return v.status !== "ok" && (v.attempts ?? 0) < MAX_ATTEMPTS;
  });
  const needFx = pending.some((r) => (r.currency ?? "USD").toUpperCase() !== "USD");
  const rates = needFx ? await usdRates() : null;

  let board = (await readScanBoard(admin)).deals;
  const minOut = addDaysIso(turkeyTodayIso(), MIN_LEAD_DAYS);
  const trips = new Map<string, Trip>();
  const skips: string[] = [];

  for (const row of pending) {
    const usd = toUsd(Number(row.price), row.currency ?? "USD", rates);
    if (usd == null) {
      skips.push(`#${row.id} kur yok (${row.currency})`);
      continue;
    }
    const checked = verifyOf(row).trips ?? {};
    const candidates = rowTrips(row, minOut);
    if (candidates.length === 0) {
      skips.push(`#${row.id} uygun tarih yok`);
      continue;
    }
    const cityName =
      typeof row.details.destName === "string" ? row.details.destName : undefined;
    for (const c of candidates) {
      if (checked[c.key]) continue;

      const probe = buildExternalCard(
        { airport: c.airport, origin: c.origin, outboundDate: c.out, returnDate: c.ret, fullUsd: Math.round(usd), cityName },
        board,
      );
      if (!probe.ok) {
        skips.push(`#${row.id} ${c.origin}→${c.airport} ${c.out}→${c.ret} $${Math.round(usd)}: ${probe.reason}`);
        continue;
      }
      const prev = trips.get(c.key);
      if (prev) {
        prev.rows.push(row);
        prev.usd = Math.min(prev.usd, usd);
      } else {
        trips.set(c.key, { ...c, usd, rows: [row], cityName });
      }
    }
  }

  const queue = [...trips.values()]
    .filter((t) => {
      if (!alreadyShown(board, t)) return true;
      skips.push(`${t.airport} ${t.out}→${t.ret} $${Math.round(t.usd)}: vitrinde_zaten`);
      return false;
    })
    .sort((a, b) => a.out.localeCompare(b.out));

  console.log(
    `${stamp} bekleyen ilan ${pending.length} · doğrulanacak tarih ${queue.length} · elenen ${skips.length}`,
  );
  for (const s of skips.slice(0, 40)) console.log(`  - ${s}`);
  for (const t of queue) {
    console.log(
      `  ? ${t.origin}→${t.airport} ${t.out}→${t.ret} kaynak $${Math.round(t.usd)} (${t.rows.map((r) => `${r.source}#${r.id}`).join(", ")})`,
    );
  }
  if (dry || queue.length === 0) return;

  const pauseUntil = loadPauseUntil();
  if (pauseUntil > Date.now()) {
    console.log(`Scrappa molası ${new Date(pauseUntil).toISOString()} bitene kadar — çıkış`);
    return;
  }
  const busy = laneBusy(board);
  if (busy) {
    console.log(`Tarama hattı meşgul: ${busy} — çıkış`);
    return;
  }
  const bound = bindLaneApiKey("a");
  if (!bound.ok) throw new Error(bound.error);
  const lock = acquireWorkerLock("a");
  if (!lock.ok) {
    console.log(`A kilidi dolu (pid ${lock.pid}) — çıkış`);
    return;
  }

  let checks = 0;
  for (const trip of queue) {
    if (checks >= MAX_CHECKS_PER_RUN) break;
    if (trip.rows.every((r) => verifyOf(r).status === "ok")) continue;
    if (checks > 0) {
      await new Promise((r) => setTimeout(r, GAP_MS));
      board = (await readScanBoard(admin)).deals;
      const again = laneBusy(board);
      if (again) {
        console.log(`Tarama hattı başladı: ${again} — duruyorum`);
        break;
      }
    }
    checks++;

    let res: Awaited<ReturnType<typeof scrappaRoundTrip>>;
    try {
      res = await scrappaRoundTrip({
        origin: trip.origin,
        destination: trip.airport,
        departureDate: trip.out,
        returnDate: trip.ret,
      });
    } catch (err) {
      if (err instanceof ScrappaUnavailableError) {
        const minutes = err.kind === "session" ? 30 : 10;
        savePause(minutes, err.message);
        console.log(`Scrappa: ${err.message} — ${minutes} dk mola`);
        if (!noWrite) {
          for (const row of trip.rows) {
            const v = verifyOf(row);
            await saveVerify(admin, row, { ...v, attempts: (v.attempts ?? 0) + 1 });
          }
        }
        break;
      }
      throw err;
    }

    const limit = trip.usd * PRICE_TOLERANCE;
    const verified = res != null && res.price <= limit;
    console.log(
      `  ${verified ? "TUTTU" : "tutmadı"} ${trip.origin}→${trip.airport} ${trip.out}→${trip.ret}: kaynak $${Math.round(trip.usd)}, Scrappa ${res ? `$${res.price}` : "sonuç yok"}`,
    );
    if (noWrite) continue;

    let cardId: string | undefined;
    if (verified) {
      const built = buildExternalCard(
        {
          airport: trip.airport,
          origin: trip.origin,
          outboundDate: trip.out,
          returnDate: trip.ret,
          fullUsd: Math.round(trip.usd),
          airline: res!.airline,
          stops: res!.stops,
          selfTransfer: res!.selfTransfer,
          cityName: trip.cityName,
        },
        board,
      );
      if (built.ok) {
        const pub = await publishExternalCard(admin, built.card);
        if (pub.ok) {
          cardId = built.card.id;
          console.log(`  vitrine eklendi ${built.card.id} (${pub.hero ? "ana fiyat" : "diğer tarihler"})`);
        } else {
          console.warn(`  vitrine yazılamadı: ${pub.error}`);
        }
      } else {
        console.log(`  kart kurulamadı: ${built.reason}`);
      }
    }

    const at = new Date().toISOString();
    for (const row of trip.rows) {
      const v = verifyOf(row);
      const tripsDone: Record<string, TripCheck> = {
        ...(v.trips ?? {}),
        [trip.key]: { status: verified ? "ok" : "fail", at, scrappaUsd: res?.price ?? null },
      };
      const keys = rowTrips(row, minOut).map((t) => t.key);
      const allFailed =
        keys.length > 0 && keys.every((k) => tripsDone[k]?.status === "fail");
      await saveVerify(admin, row, {
        ...v,
        sourceUsd: Math.round(trip.usd),
        trips: tripsDone,
        status: verified && cardId ? "ok" : allFailed ? "fail" : undefined,
        cardId: cardId ?? v.cardId,
      });
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
