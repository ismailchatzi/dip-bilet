/**
 * Uzak şehir testi (11–14 Ekim 2026) — A hattı, günün near + rematch'i bittikten sonra.
 *
 * 11 Eki grup 1 tek yön · 12 Eki grup 2 tek yön (Avrupa stratejisi: 22–180 gün, gidiş + dönüş
 * ayrı; sonra şehir başı en ucuz 5 sentetik 7–10 gece adayı paketle doğrulanır).
 * 13 Eki grup 1 paket · 14 Eki grup 2 paket (her gün gidiş × 7 ve 10 gece; en ucuz gidişin
 * paketi yoksa 2. gidiş bir kez denenir).
 *
 * Yalnız IST. Yalnız veri: price_observations'a `remote_test_*` kaynağıyla yazar —
 * vitrin, fiyat rehberi, alarm ve rematch yalnız `scrappa_oneway` okur.
 * A kilidini tutar (aynı hesapta ikinci süreç yok); dış kaynak doğrulamasını 15 dk'da bir
 * kendi içinde yapar. 22:00 TR'de durur; yarım kalan iş ertesi güne taşınmaz.
 *
 * cron 3-59/4: npx tsx scripts/remote-test.ts           → koşullar uygunsa başlar / devam eder
 *              npx tsx scripts/remote-test.ts --dry     → bugünün planı ve başlama koşulları
 *              npx tsx scripts/remote-test.ts --dry --date 2026-10-13
 *              npx tsx scripts/remote-test.ts status    → DB'deki son özet
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExternalVerifyRound } from "@/lib/external/verify-round";
import {
  scrappaOneWay,
  scrappaRoundTrip,
  ScrappaUnavailableError,
  type ScrappaOneWay,
} from "@/lib/providers/scrappa";
import { readScanBoard } from "@/lib/scan/board";
import { SCRAPPA_HALTED } from "@/lib/scan/halt";
import { insertObservations, type ObservationRow } from "@/lib/scan/observations";
import { horizonDates } from "@/lib/scan/scrappa-horizon";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import {
  SCRAPPA_REMATCH_502_BACKOFF_MS,
  SCRAPPA_REMATCH_CANDIDATE_GAP_MS,
  SCRAPPA_REMATCH_CANDIDATE_MAX_ATTEMPTS,
  SCRAPPA_REQUEST_GAP_MS,
  SCRAPPA_SESSION_CIRCUIT_AFTER,
  SCRAPPA_SESSION_CIRCUIT_PAUSE_MS,
  SCRAPPA_SESSION_SOFT_PAUSE_MS,
  SCRAPPA_TRANSIENT_PAUSE_MS,
} from "@/lib/scan/scrappa-schedule";
import { acquireWorkerLock, otherLiveWorkerPid } from "@/lib/scan/scrappa-worker-lock";
import { addDaysIso, nightsBetween, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { SupabaseClient } from "@supabase/supabase-js";

type Mode = "oneway" | "rt";
type City = { code: string; name: string; airports: string[] };

const GROUPS: Record<1 | 2, City[]> = {
  1: [
    { code: "NYC", name: "New York", airports: ["JFK", "EWR"] },
    { code: "LAX", name: "Los Angeles", airports: ["LAX"] },
    { code: "MIA", name: "Miami", airports: ["MIA"] },
    { code: "GRU", name: "São Paulo", airports: ["GRU"] },
    { code: "SYD", name: "Sidney", airports: ["SYD"] },
  ],
  2: [
    { code: "TYO", name: "Tokyo", airports: ["HND", "NRT"] },
    { code: "ICN", name: "Seul", airports: ["ICN"] },
    { code: "KUL", name: "Kuala Lumpur", airports: ["KUL"] },
    { code: "SIN", name: "Singapur", airports: ["SIN"] },
    { code: "HKG", name: "Hong Kong", airports: ["HKG"] },
  ],
};

const PLAN: Record<string, { group: 1 | 2; mode: Mode }> = {
  "2026-10-11": { group: 1, mode: "oneway" },
  "2026-10-12": { group: 2, mode: "oneway" },
  "2026-10-13": { group: 1, mode: "rt" },
  "2026-10-14": { group: 2, mode: "rt" },
};

const ORIGIN = "IST";
const RT_NIGHTS = [7, 10] as const;
const SYNTH_MIN_NIGHTS = 7;
const SYNTH_MAX_NIGHTS = 10;
const VERIFY_CANDIDATES = 5;
const RT_OUTBOUND_TRIES = 2;
/** 22:00 TR — sert durma. */
const HARD_STOP_MIN = 22 * 60;
/** Near'ın rematch'i hiç başlamadıysa bu saatten sonra yine de başla. */
const REMATCH_FALLBACK_MIN = 13 * 60;
const EXTERNAL_EVERY_MS = 15 * 60_000;
const YIELD_CHECK_MS = 60_000;
const META_EVERY_MS = 30 * 60_000;

const STATE_FILE = resolve(process.cwd(), ".remote-test-state.json");

const SRC_ONEWAY = "remote_test_oneway";
const SRC_VERIFY = "remote_test_verify";
const SRC_RT = "remote_test_rt";
const SRC_RT2 = "remote_test_rt2";
const SRC_META = "remote_test_meta";

type AirportStats = { ok: number; empty: number; rescued2: number; errors: number };

type VerifyResult = {
  city: string;
  airport: string;
  out: string;
  ret: string;
  synthetic: number;
  rank: number;
  rt: number | null;
  airline?: string;
  status: "ok" | "empty" | "failed";
};

type State = {
  day: string;
  group: 1 | 2;
  mode: Mode;
  phase: "scan" | "verify" | "done";
  index: number;
  verifyCity: number;
  verifyRank: number;
  startedAt: string;
  scanFinishedAt?: string;
  finishedAt?: string;
  stopReason?: string;
  /** Mantıksal sorgu (tek yön = 1, paket = 1). */
  requests: number;
  /** Scrappa'ya giden gerçek istek (paket = gidiş listesi + her tamamlama). */
  apiCalls: number;
  upstreamErrors: number;
  extChecks: number;
  byAirport: Record<string, AirportStats>;
  verify: VerifyResult[];
};

type Item = { kind: "oneway"; from: string; to: string; date: string; city: City; airport: string }
  | { kind: "rt"; date: string; ret: string; nights: number; city: City; airport: string };

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function trMinute(now = new Date()) {
  const tr = new Date(now.getTime() + 3 * 3600_000);
  return tr.getUTCHours() * 60 + tr.getUTCMinutes();
}

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

/** Tarih önce: 22:00'ye yetişmezse bütün şehirlerden en uzak tarihler kalır. */
function buildItems(day: string, group: 1 | 2, mode: Mode): Item[] {
  const now = new Date(`${day}T09:00:00Z`);
  const dates = horizonDates("full", now);
  const items: Item[] = [];
  for (const date of dates) {
    for (const city of GROUPS[group]) {
      for (const airport of city.airports) {
        if (mode === "oneway") {
          items.push({ kind: "oneway", from: ORIGIN, to: airport, date, city, airport });
          items.push({ kind: "oneway", from: airport, to: ORIGIN, date, city, airport });
        } else {
          for (const nights of RT_NIGHTS) {
            items.push({ kind: "rt", date, ret: addDaysIso(date, nights), nights, city, airport });
          }
        }
      }
    }
  }
  return items;
}

function freshState(day: string, group: 1 | 2, mode: Mode): State {
  return {
    day,
    group,
    mode,
    phase: "scan",
    index: 0,
    verifyCity: 0,
    verifyRank: 0,
    startedAt: new Date().toISOString(),
    requests: 0,
    apiCalls: 0,
    upstreamErrors: 0,
    extChecks: 0,
    byAirport: {},
    verify: [],
  };
}

function loadState(): State | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return null;
  }
}

function saveState(s: State) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function airportStats(s: State, airport: string): AirportStats {
  s.byAirport[airport] ??= { ok: 0, empty: 0, rescued2: 0, errors: 0 };
  return s.byAirport[airport]!;
}

async function writeMeta(admin: SupabaseClient, s: State) {
  const row: ObservationRow = {
    route_key: "META",
    season_key: s.day.slice(0, 7),
    destination_code: null,
    destination_name: JSON.stringify({ ...s, metaAt: new Date().toISOString() }),
    price: 1,
    currency: "USD",
    outbound_date: s.day,
    return_date: null,
    source: SRC_META,
    discount_percent: null,
    average_price: null,
  };
  const res = await insertObservations(admin, [row]);
  if (!res.ok) log(`meta yazılamadı: ${res.error}`);
}

function fareRow(
  source: string,
  city: City,
  routeKey: string,
  out: string,
  ret: string | null,
  fare: ScrappaOneWay,
  extra?: { synthetic?: number; rank?: number },
): ObservationRow {
  return {
    route_key: routeKey,
    season_key: out.slice(0, 7),
    destination_code: city.code,
    destination_name: routeKey.replace(">", "→"),
    price: fare.price,
    currency: "USD",
    outbound_date: out,
    return_date: ret,
    source,
    discount_percent: extra?.rank ?? null,
    average_price: extra?.synthetic ?? null,
    airline: fare.airline ?? null,
    stops: typeof fare.stops === "number" ? fare.stops : null,
    self_transfer: fare.selfTransfer === true ? true : null,
  };
}

/** A'nın kendi işi (near / rematch) yeniden koşuyorsa kilidi bırak; cron sonra devam ettirir. */
function laneAWorkRunning(board: Awaited<ReturnType<typeof readScanBoard>>["deals"]) {
  if (board?.scrappaJob?.status === "running") return "A tek yön sürüyor";
  if (board?.scrappaRematchJob?.status === "running") return "A rematch sürüyor";
  return null;
}

function nearDoneToday(
  board: Awaited<ReturnType<typeof readScanBoard>>["deals"],
  today: string,
  minute: number,
): string | null {
  const job = board?.scrappaJob;
  if (!job?.startedAt) return "A near kaydı yok";
  if (turkeyTodayIso(new Date(job.startedAt)) !== today) return "A bugünkü near'ı başlamadı";
  const busy = laneAWorkRunning(board);
  if (busy) return busy;
  const rm = board?.scrappaRematchJob;
  const rematchAfterNear =
    rm?.startedAt != null && Date.parse(rm.startedAt) >= Date.parse(job.startedAt);
  if (!rematchAfterNear && minute < REMATCH_FALLBACK_MIN) return "A near rematch'i henüz başlamadı";
  return null;
}

class Runner {
  private streak = 0;
  private lastExternal = 0;
  private lastYieldCheck = Date.now();
  private lastMeta = Date.now();

  constructor(
    private admin: SupabaseClient,
    private s: State,
  ) {}

  stopNow(): boolean {
    return trMinute() >= HARD_STOP_MIN;
  }

  /** false → dur (saat doldu ya da A'nın kendi işi geldi). */
  async housekeeping(): Promise<boolean> {
    if (this.stopNow()) return false;
    const now = Date.now();
    if (now - this.lastYieldCheck >= YIELD_CHECK_MS) {
      this.lastYieldCheck = now;
      const busy = laneAWorkRunning((await readScanBoard(this.admin)).deals);
      if (busy) {
        log(`${busy} — kilidi bırakıyorum, cron devam ettirir`);
        return false;
      }
    }
    if (now - this.lastExternal >= EXTERNAL_EVERY_MS) {
      this.lastExternal = now;
      try {
        const { checks } = await runExternalVerifyRound({ insideLaneA: true });
        this.s.extChecks += checks;
        if (checks > 0) await sleep(SCRAPPA_REQUEST_GAP_MS);
      } catch (err) {
        log(`dış kaynak turu hata: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (now - this.lastMeta >= META_EVERY_MS) {
      this.lastMeta = now;
      await writeMeta(this.admin, this.s);
    }
    return true;
  }

  /** Oturum / geçici hata molası. false → saat doldu. */
  async outage(err: ScrappaUnavailableError, airport: string): Promise<boolean> {
    this.s.upstreamErrors += 1;
    airportStats(this.s, airport).errors += 1;
    this.streak += 1;
    let wait: number;
    if (this.streak >= SCRAPPA_SESSION_CIRCUIT_AFTER) {
      wait = SCRAPPA_SESSION_CIRCUIT_PAUSE_MS;
      this.streak = 0;
    } else {
      wait = err.kind === "session" ? SCRAPPA_SESSION_SOFT_PAUSE_MS : SCRAPPA_TRANSIENT_PAUSE_MS;
    }
    log(`Scrappa ${err.kind}: ${err.message} — ${Math.round(wait / 1000)} sn mola`);
    saveState(this.s);
    const until = Date.now() + wait;
    while (Date.now() < until) {
      if (this.stopNow()) return false;
      await sleep(Math.min(30_000, until - Date.now()));
    }
    return true;
  }

  ok() {
    this.streak = 0;
  }

  readonly countCall = () => {
    this.s.apiCalls += 1;
  };

  async scan(items: Item[]): Promise<boolean> {
    while (this.s.index < items.length) {
      if (!(await this.housekeeping())) return false;
      const item = items[this.s.index]!;
      const st = airportStats(this.s, item.airport);
      try {
        this.s.requests += 1;
        if (item.kind === "oneway") {
          this.countCall();
          const fare = await scrappaOneWay({ origin: item.from, destination: item.to, date: item.date });
          this.ok();
          if (fare) {
            st.ok += 1;
            const res = await insertObservations(this.admin, [
              fareRow(SRC_ONEWAY, item.city, `${item.from}>${item.to}`, item.date, null, fare),
            ]);
            if (!res.ok) log(`gözlem yazılamadı: ${res.error}`);
          } else {
            st.empty += 1;
          }
        } else {
          const fare = await scrappaRoundTrip({
            origin: ORIGIN,
            destination: item.airport,
            departureDate: item.date,
            returnDate: item.ret,
            outboundTries: RT_OUTBOUND_TRIES,
            onCall: this.countCall,
          });
          this.ok();
          if (fare) {
            st.ok += 1;
            const rescued = (fare.outboundTry ?? 1) > 1;
            if (rescued) st.rescued2 += 1;
            const res = await insertObservations(this.admin, [
              fareRow(rescued ? SRC_RT2 : SRC_RT, item.city, `${ORIGIN}>${item.airport}`, item.date, item.ret, fare),
            ]);
            if (!res.ok) log(`gözlem yazılamadı: ${res.error}`);
          } else {
            st.empty += 1;
          }
        }
      } catch (err) {
        if (err instanceof ScrappaUnavailableError) {
          this.s.requests -= 1;
          if (!(await this.outage(err, item.airport))) return false;
          continue;
        }
        st.errors += 1;
        log(`hata ${item.airport} ${item.date}: ${err instanceof Error ? err.message : err}`);
      }
      this.s.index += 1;
      if (this.s.index % 25 === 0) {
        log(`ilerleme ${this.s.index}/${items.length}`);
      }
      saveState(this.s);
      await sleep(SCRAPPA_REQUEST_GAP_MS);
    }
    return true;
  }

  async loadOwnLegs(city: City) {
    const legs: { route_key: string; outbound_date: string; price: number }[] = [];
    for (let page = 0; page < 10; page++) {
      const { data, error } = await this.admin
        .from("price_observations")
        .select("route_key, outbound_date, price")
        .eq("source", SRC_ONEWAY)
        .eq("destination_code", city.code)
        .gte("observed_at", this.s.startedAt)
        .order("id", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(`gözlemler okunamadı: ${error.message}`);
      for (const r of data ?? []) {
        legs.push({ route_key: String(r.route_key), outbound_date: String(r.outbound_date), price: Number(r.price) });
      }
      if ((data ?? []).length < 1000) break;
    }
    return legs;
  }

  /** Avrupa rematch'i gibi: en ucuz sentetik adaylar, aday başı en fazla 3 deneme, adaylar arası 15 sn. */
  async candidates(city: City) {
    const legs = await this.loadOwnLegs(city);
    const pairs: { airport: string; out: string; ret: string; total: number }[] = [];
    for (const airport of city.airports) {
      const outs = legs.filter((l) => l.route_key === `${ORIGIN}>${airport}`);
      const rets = legs.filter((l) => l.route_key === `${airport}>${ORIGIN}`);
      for (const o of outs) {
        for (const r of rets) {
          const n = nightsBetween(o.outbound_date, r.outbound_date);
          if (n < SYNTH_MIN_NIGHTS || n > SYNTH_MAX_NIGHTS) continue;
          pairs.push({ airport, out: o.outbound_date, ret: r.outbound_date, total: o.price + r.price });
        }
      }
    }
    const best = new Map<string, (typeof pairs)[number]>();
    for (const p of pairs) {
      const key = `${p.out}|${p.ret}`;
      const prev = best.get(key);
      if (!prev || p.total < prev.total) best.set(key, p);
    }
    return [...best.values()].sort((a, b) => a.total - b.total).slice(0, VERIFY_CANDIDATES);
  }

  async verify(): Promise<boolean> {
    const cities = GROUPS[this.s.group];
    while (this.s.verifyCity < cities.length) {
      const city = cities[this.s.verifyCity]!;
      const cands = await this.candidates(city);
      while (this.s.verifyRank < cands.length) {
        if (!(await this.housekeeping())) return false;
        const c = cands[this.s.verifyRank]!;
        let result: VerifyResult = {
          city: city.code,
          airport: c.airport,
          out: c.out,
          ret: c.ret,
          synthetic: Math.round(c.total),
          rank: this.s.verifyRank + 1,
          rt: null,
          status: "failed",
        };
        for (let attempt = 1; attempt <= SCRAPPA_REMATCH_CANDIDATE_MAX_ATTEMPTS; attempt++) {
          try {
            this.s.requests += 1;
            const fare = await scrappaRoundTrip({
              origin: ORIGIN,
              destination: c.airport,
              departureDate: c.out,
              returnDate: c.ret,
              onCall: this.countCall,
            });
            this.ok();
            if (fare) {
              result = { ...result, rt: fare.price, airline: fare.airline, status: "ok" };
              const res = await insertObservations(this.admin, [
                fareRow(SRC_VERIFY, city, `${ORIGIN}>${c.airport}`, c.out, c.ret, fare, {
                  synthetic: Math.round(c.total),
                  rank: result.rank,
                }),
              ]);
              if (!res.ok) log(`doğrulama yazılamadı: ${res.error}`);
            } else {
              result = { ...result, status: "empty" };
            }
            break;
          } catch (err) {
            if (!(err instanceof ScrappaUnavailableError)) {
              log(`doğrulama hata ${city.code} ${c.out}: ${err instanceof Error ? err.message : err}`);
              break;
            }
            if (err.kind === "session") {
              if (!(await this.outage(err, c.airport))) return false;
              attempt -= 1;
              continue;
            }
            this.s.upstreamErrors += 1;
            this.streak += 1;
            if (attempt >= SCRAPPA_REMATCH_CANDIDATE_MAX_ATTEMPTS) break;
            const wait = SCRAPPA_REMATCH_502_BACKOFF_MS[attempt - 1] ?? 30_000;
            log(`doğrulama ${err.kind} ${city.code} ${c.out} deneme ${attempt} — ${wait / 1000} sn`);
            await sleep(wait);
            if (this.stopNow()) return false;
          }
        }
        log(`doğrulama ${city.code} #${result.rank} ${c.airport} ${c.out}→${c.ret} sentetik $${result.synthetic} paket ${result.rt ?? result.status}`);
        this.s.verify.push(result);
        this.s.verifyRank += 1;
        saveState(this.s);
        await sleep(SCRAPPA_REMATCH_CANDIDATE_GAP_MS);
      }
      this.s.verifyCity += 1;
      this.s.verifyRank = 0;
      saveState(this.s);
    }
    return true;
  }
}

async function status(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("price_observations")
    .select("destination_name, observed_at")
    .eq("source", SRC_META)
    .order("observed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) {
    console.log("Henüz özet yok.");
    return;
  }
  console.log(JSON.stringify(JSON.parse(String(data[0].destination_name)), null, 2));
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const dateArg = argv[argv.indexOf("--date") + 1];
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin yok (.env.local)");

  if (argv[0] === "status") return status(admin);

  const today = dry && argv.includes("--date") && dateArg ? dateArg : turkeyTodayIso();
  const plan = PLAN[today];
  if (!plan) {
    if (dry) log(`${today} test günü değil`);
    return;
  }
  const minute = trMinute();
  const items = buildItems(today, plan.group, plan.mode);

  if (dry) {
    const cities = GROUPS[plan.group].map((c) => `${c.name} (${c.airports.join("+")})`).join(", ");
    log(`${today}: grup ${plan.group} · ${plan.mode === "oneway" ? "tek yön" : "paket"} · ${items.length} sorgu`);
    log(`şehirler: ${cities}`);
    log(`ilk: ${JSON.stringify({ ...items[0], city: items[0]?.city.code })}`);
    log(`son: ${JSON.stringify({ ...items[items.length - 1], city: items[items.length - 1]?.city.code })}`);
    const board = (await readScanBoard(admin)).deals;
    log(`başlama koşulu: ${nearDoneToday(board, turkeyTodayIso(), minute) ?? "uygun"}`);
    log(`A işçisi: ${otherLiveWorkerPid("a") ?? "yok"}`);
    return;
  }

  if (SCRAPPA_HALTED) return log("Scrappa durdurulmuş — çıkış");
  if (minute < 4 * 60 + 20 || minute >= HARD_STOP_MIN) return;

  let state = loadState();
  if (state?.day === today && state.phase === "done") return;

  const board = (await readScanBoard(admin)).deals;
  const wait = nearDoneToday(board, today, minute);
  if (wait) return log(`bekliyor: ${wait}`);
  const other = otherLiveWorkerPid("a");
  if (other != null) return log(`A kilidi dolu (pid ${other}) — çıkış`);

  const bound = bindLaneApiKey("a");
  if (!bound.ok) throw new Error(bound.error);
  const lock = acquireWorkerLock("a");
  if (!lock.ok) return log(`A kilidi dolu (pid ${lock.pid}) — çıkış`);

  if (state?.day !== today) {
    state = freshState(today, plan.group, plan.mode);
    log(`BAŞLADI ${today} grup ${plan.group} ${plan.mode} · ${items.length} sorgu`);
  } else {
    log(`DEVAM ${today} ${state.phase} ${state.index}/${items.length}`);
  }
  saveState(state);

  const runner = new Runner(admin, state);
  let finished = false;
  if (state.phase === "scan") {
    const done = await runner.scan(items);
    if (done) {
      state.scanFinishedAt = new Date().toISOString();
      state.phase = plan.mode === "oneway" ? "verify" : "done";
      saveState(state);
      log(`tarama bitti (${state.requests} sorgu)`);
    }
  }
  if (state.phase === "verify") {
    const done = await runner.verify();
    if (done) {
      state.phase = "done";
      log("doğrulama bitti");
    }
  }
  finished = state.phase === "done";
  if (!finished && runner.stopNow()) {
    state.phase = "done";
    state.stopReason = "22:00 sert durma";
    log("22:00 — durdu, kalan iş taşınmaz");
  }
  if (state.phase === "done") state.finishedAt = new Date().toISOString();
  saveState(state);
  await writeMeta(admin, state);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
