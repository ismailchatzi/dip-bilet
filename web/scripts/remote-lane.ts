/**
 * Uzak şehir hattı — A anahtarı, günün near + near rematch'i bittikten sonra.
 * 14 Eki 2026'dan itibaren gün aşırı 1. grup / 2. grup (remote-targets).
 *
 * Avrupa stratejisi: yalnız IST, 22–180 gün, gidiş + dönüş tek yön (`scrappa_oneway`).
 * Şehir bitince o şehrin gözlemleriyle rematch (top 3+2, aday başı 3 deneme, hero bulununca
 * dur) → final hero booking → vitrin (aynı eşik / sezonluk kapıları).
 * A kilidini tutar; A'nın kendi işi yeniden koşarsa kilidi bırakır. Ertesi sabah 03:30 TR'de
 * durur (03:55 kesiminden önce), yarım kalan iş taşınmaz.
 *
 * cron 3-59/4: npx tsx scripts/remote-test.ts   (remote-test.ts bu dosyayı çağırır)
 *              npx tsx scripts/remote-lane.ts --dry [--date 2026-10-15]
 *              npx tsx scripts/remote-lane.ts status
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExternalVerifyRound } from "@/lib/external/verify-round";
import { scrappaOneWay, ScrappaUnavailableError } from "@/lib/providers/scrappa";
import { foldOneCardPerCity, isUnverifiedOneWaySum } from "@/lib/deal-display";
import { notifyNewDeals } from "@/lib/notify-new-deals";
import { patchScanBoard, readScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import { SCRAPPA_HALTED } from "@/lib/scan/halt";
import { insertObservations, type ObservationRow } from "@/lib/scan/observations";
import { horizonDates } from "@/lib/scan/scrappa-horizon";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import {
  applyBookingToDeal,
  cardFromPending,
  destCodeFromDeal,
  matchDestFromDb,
  type RtPending,
} from "@/lib/scan/scrappa-match";
import { cityCardWithFresh } from "@/lib/scan/scrappa-rematch";
import {
  SCRAPPA_BOOKING_MAX_ATTEMPTS,
  SCRAPPA_REMATCH_502_BACKOFF_MS,
  SCRAPPA_REQUEST_GAP_MS,
  SCRAPPA_SESSION_CIRCUIT_AFTER,
  SCRAPPA_SESSION_CIRCUIT_PAUSE_MS,
  SCRAPPA_SESSION_SOFT_PAUSE_MS,
  SCRAPPA_TRANSIENT_PAUSE_MS,
} from "@/lib/scan/scrappa-schedule";
import type { ScrappaDestination } from "@/lib/scan/scrappa-targets";
import { acquireWorkerLock, otherLiveWorkerPid } from "@/lib/scan/scrappa-worker-lock";
import { REMOTE_GROUPS, remoteAirports, remoteGroupForDay } from "@/lib/scan/remote-targets";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORIGIN = "IST";
/** Near'ın rematch'i hiç başlamadıysa bu saatten sonra yine de başla. */
const REMATCH_FALLBACK_MIN = 13 * 60;
const EXTERNAL_EVERY_MS = 15 * 60_000;
const YIELD_CHECK_MS = 60_000;
const BREATHER_MS = 15_000;

const STATE_FILE = resolve(process.cwd(), ".remote-lane-state.json");

type Step = "scan" | "verify" | "booking" | "publish";

type CityResult = {
  city: string;
  scanned: number;
  fares: number;
  candidatesTried: number;
  hero: number | null;
  booked: number | null;
  published: boolean;
  note?: string;
};

type State = {
  day: string;
  group: 1 | 2;
  cityIndex: number;
  step: Step;
  itemIndex: number;
  cityStartedAt: string;
  verifyAttempts: number;
  pending: RtPending[];
  startedAt: string;
  finishedAt?: string;
  stopReason?: string;
  done: boolean;
  requests: number;
  upstreamErrors: number;
  results: CityResult[];
};

type Item = { from: string; to: string; date: string; airport: string };

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

function stopAtMs(day: string) {
  return Date.parse(`${addDaysIso(day, 1)}T03:30:00+03:00`);
}

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function cityItems(day: string, dest: ScrappaDestination): Item[] {
  const dates = horizonDates("full", new Date(`${day}T09:00:00Z`));
  const items: Item[] = [];
  for (const date of dates) {
    for (const airport of remoteAirports(dest)) {
      items.push({ from: ORIGIN, to: airport, date, airport });
      items.push({ from: airport, to: ORIGIN, date, airport });
    }
  }
  return items;
}

function freshState(day: string, group: 1 | 2): State {
  const now = new Date().toISOString();
  return {
    day,
    group,
    cityIndex: 0,
    step: "scan",
    itemIndex: 0,
    cityStartedAt: now,
    verifyAttempts: 0,
    pending: [],
    startedAt: now,
    done: false,
    requests: 0,
    upstreamErrors: 0,
    results: [],
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
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE_FILE);
}

type Board = Awaited<ReturnType<typeof readScanBoard>>["deals"];

function laneAWorkRunning(board: Board) {
  if (board?.scrappaJob?.status === "running") return "A tek yön sürüyor";
  if (board?.scrappaRematchJob?.status === "running") return "A rematch sürüyor";
  return null;
}

function nearDoneToday(board: Board, today: string, minute: number): string | null {
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

function cityResult(s: State, dest: ScrappaDestination): CityResult {
  let r = s.results.find((x) => x.city === dest.code);
  if (!r) {
    r = { city: dest.code, scanned: 0, fares: 0, candidatesTried: 0, hero: null, booked: null, published: false };
    s.results.push(r);
  }
  return r;
}

class Lane {
  private streak = 0;
  private lastExternal = 0;
  private lastYieldCheck = Date.now();

  constructor(
    private admin: SupabaseClient,
    private s: State,
  ) {}

  stopNow() {
    return Date.now() >= stopAtMs(this.s.day);
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
        if (checks > 0) await sleep(SCRAPPA_REQUEST_GAP_MS);
      } catch (err) {
        log(`dış kaynak turu hata: ${err instanceof Error ? err.message : err}`);
      }
    }
    return true;
  }

  /** Oturum / geçici hata molası. false → saat doldu. */
  async outage(err: ScrappaUnavailableError): Promise<boolean> {
    this.s.upstreamErrors += 1;
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

  async scanCity(dest: ScrappaDestination): Promise<boolean> {
    const items = cityItems(this.s.day, dest);
    const res = cityResult(this.s, dest);
    while (this.s.itemIndex < items.length) {
      if (!(await this.housekeeping())) return false;
      const item = items[this.s.itemIndex]!;
      try {
        this.s.requests += 1;
        const fare = await scrappaOneWay({ origin: item.from, destination: item.to, date: item.date });
        this.streak = 0;
        res.scanned += 1;
        if (fare) {
          res.fares += 1;
          const row: ObservationRow = {
            route_key: `${item.from}>${item.to}`,
            season_key: item.date.slice(0, 7),
            destination_code: dest.code,
            destination_name: `${item.from}→${item.to}`,
            price: fare.price,
            currency: "USD",
            outbound_date: item.date,
            return_date: null,
            source: "scrappa_oneway",
            discount_percent: null,
            average_price: null,
            airline: fare.airline ?? null,
            stops: typeof fare.stops === "number" ? fare.stops : null,
            self_transfer: fare.selfTransfer === true ? true : null,
          };
          const ins = await insertObservations(this.admin, [row]);
          if (!ins.ok) log(`gözlem yazılamadı: ${ins.error}`);
        }
      } catch (err) {
        if (err instanceof ScrappaUnavailableError) {
          this.s.requests -= 1;
          if (!(await this.outage(err))) return false;
          continue;
        }
        log(`hata ${item.from}>${item.to} ${item.date}: ${err instanceof Error ? err.message : err}`);
      }
      this.s.itemIndex += 1;
      if (this.s.itemIndex % 50 === 0) log(`${dest.code} ${this.s.itemIndex}/${items.length}`);
      saveState(this.s);
      await sleep(SCRAPPA_REQUEST_GAP_MS);
    }
    return true;
  }

  /** Avrupa rematch'i: top 3+2, aday başı 3 deneme, hero bulununca dur. Booking ayrı adım. */
  async verifyCity(dest: ScrappaDestination): Promise<boolean> {
    const res = cityResult(this.s, dest);
    for (;;) {
      if (!(await this.housekeeping())) return false;
      try {
        const out = await matchDestFromDb(this.admin, dest, {
          rematchMode: true,
          obs: { observedAtGte: this.s.cityStartedAt },
          startAttempt: this.s.verifyAttempts,
          seedPending: this.s.pending,
          onSessionOk: () => {
            this.streak = 0;
          },
          onAttemptDone: ({ attempts, pending }) => {
            this.s.verifyAttempts = attempts;
            this.s.pending = pending;
            saveState(this.s);
          },
        });
        this.s.pending = out.pending;
        res.candidatesTried = this.s.verifyAttempts;
        res.hero = out.pending[0]?.deal.price ?? null;
        log(`${dest.code} doğrulama: ${out.pending.length ? `hero $${res.hero}` : "fırsat yok"}`);
        return true;
      } catch (err) {
        if (!(err instanceof ScrappaUnavailableError)) throw err;
        if (!(await this.outage(err))) return false;
      }
    }
  }

  /** Final hero booking; kalem başı 3 upstream hatası → RT fiyatıyla geçilir. */
  async bookCity(dest: ScrappaDestination): Promise<Deal | null> {
    const res = cityResult(this.s, dest);
    const card = cardFromPending(this.s.pending);
    if (!card) return null;
    const hero = [...this.s.pending].sort((a, b) => a.deal.price - b.deal.price)[0]!;
    for (let attempt = 1; attempt <= SCRAPPA_BOOKING_MAX_ATTEMPTS; attempt++) {
      try {
        const booked = await applyBookingToDeal(hero, {
          onSessionOk: () => {
            this.streak = 0;
          },
        });
        if (!booked) {
          res.note = "booking fiyatı eşik üstü";
          return null;
        }
        res.booked = booked.price;
        return { ...card, ...booked, dateOptions: card.dateOptions };
      } catch (err) {
        if (!(err instanceof ScrappaUnavailableError)) throw err;
        this.s.upstreamErrors += 1;
        if (err.kind === "session") {
          if (!(await this.outage(err))) return null;
          attempt -= 1;
          continue;
        }
        if (attempt >= SCRAPPA_BOOKING_MAX_ATTEMPTS) break;
        await sleep(SCRAPPA_REMATCH_502_BACKOFF_MS[attempt - 1] ?? 30_000);
        if (this.stopNow()) return null;
      }
    }
    res.note = "booking alınamadı — RT fiyatıyla";
    return card;
  }

  async publishCity(dest: ScrappaDestination, card: Deal) {
    const res = cityResult(this.s, dest);
    const board = await readScanBoard(this.admin);
    const previous = board.deals?.deals ?? [];
    const others = previous.filter((d) => destCodeFromDeal(d) !== dest.code);
    const cityPrev = previous.filter((d) => destCodeFromDeal(d) === dest.code);
    const merged = cityCardWithFresh(cityPrev, card);
    const deals = [
      ...others.filter((d) => !isUnverifiedOneWaySum(d)),
      ...foldOneCardPerCity(merged ? [merged] : []),
    ];
    const { payload, live, previousLive } = foldShowcase(board.deals, deals);
    const saved = await patchScanBoard(this.admin, { deals: payload });
    if (!saved.ok) {
      log(`${dest.code} vitrin yazılamadı: ${saved.error}`);
      return;
    }
    res.published = live.some((d) => destCodeFromDeal(d) === dest.code);
    log(`${dest.code} vitrin: ${res.published ? `kart $${card.price}` : "eşik kapısından geçmedi"}`);
    await notifyNewDeals(this.admin, previousLive, live);
  }

  nextCity() {
    this.s.cityIndex += 1;
    this.s.step = "scan";
    this.s.itemIndex = 0;
    this.s.cityStartedAt = new Date().toISOString();
    this.s.verifyAttempts = 0;
    this.s.pending = [];
    saveState(this.s);
  }

  /** false → saat doldu / A işi geldi (cron devam ettirir). */
  async run(): Promise<boolean> {
    const cities = REMOTE_GROUPS[this.s.group];
    while (this.s.cityIndex < cities.length) {
      const dest = cities[this.s.cityIndex]!;
      if (this.s.step === "scan") {
        if (this.s.itemIndex === 0) {
          this.s.cityStartedAt = new Date().toISOString();
          saveState(this.s);
          log(`${dest.code} tarama başladı`);
        }
        if (!(await this.scanCity(dest))) return false;
        this.s.step = "verify";
        saveState(this.s);
        await sleep(BREATHER_MS);
      }
      if (this.s.step === "verify") {
        if (!(await this.verifyCity(dest))) return false;
        this.s.step = this.s.pending.length > 0 ? "booking" : "publish";
        saveState(this.s);
        if (this.s.pending.length === 0) {
          this.nextCity();
          continue;
        }
        await sleep(BREATHER_MS);
      }
      if (this.s.step === "booking" || this.s.step === "publish") {
        if (!(await this.housekeeping())) return false;
        const card = await this.bookCity(dest);
        if (this.stopNow()) return false;
        if (card) await this.publishCity(dest, card);
        this.nextCity();
      }
    }
    return true;
  }
}

async function status() {
  const s = loadState();
  console.log(s ? JSON.stringify({ ...s, pending: s.pending.length }, null, 2) : "Durum dosyası yok.");
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  if (argv[0] === "status") return status();
  const dry = argv.includes("--dry");
  const dateArg = argv[argv.indexOf("--date") + 1];
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin yok (.env.local)");

  const today = dry && argv.includes("--date") && dateArg ? dateArg : turkeyTodayIso();
  const saved = dry ? null : loadState();
  /** Gece yarısından sonra dünün yarım işi 03:30'a kadar sürer. */
  const overnight =
    saved != null && !saved.done && saved.day < today && Date.now() < stopAtMs(saved.day);
  const workDay = overnight && saved ? saved.day : today;
  const group = remoteGroupForDay(workDay);
  if (!group) {
    if (dry) log(`${workDay} uzak hat başlamadı`);
    return;
  }
  const minute = trMinute();

  if (dry) {
    const cities = REMOTE_GROUPS[group];
    const total = cities.reduce((n, c) => n + cityItems(workDay, c).length, 0);
    log(`${workDay}: grup ${group} · ${cities.map((c) => remoteAirports(c).join("+")).join(", ")} · ${total} tek yön`);
    const board = (await readScanBoard(admin)).deals;
    log(`başlama koşulu: ${nearDoneToday(board, turkeyTodayIso(), minute) ?? "uygun"}`);
    log(`A işçisi: ${otherLiveWorkerPid("a") ?? "yok"}`);
    return;
  }

  if (SCRAPPA_HALTED) return log("Scrappa durdurulmuş — çıkış");
  if (!overnight && minute < 4 * 60 + 20) return;

  let state = saved;
  if (state?.day === workDay && state.done) return;

  const board = (await readScanBoard(admin)).deals;
  const wait = overnight ? laneAWorkRunning(board) : nearDoneToday(board, today, minute);
  if (wait) return log(`bekliyor: ${wait}`);
  const other = otherLiveWorkerPid("a");
  if (other != null) return log(`A kilidi dolu (pid ${other}) — çıkış`);

  const bound = bindLaneApiKey("a");
  if (!bound.ok) throw new Error(bound.error);
  const lock = acquireWorkerLock("a");
  if (!lock.ok) return log(`A kilidi dolu (pid ${lock.pid}) — çıkış`);

  if (state?.day !== workDay) {
    state = freshState(workDay, group);
    log(`BAŞLADI ${workDay} grup ${group}`);
  } else {
    log(`DEVAM ${workDay} grup ${group} şehir ${state.cityIndex} ${state.step} ${state.itemIndex}`);
  }
  saveState(state);

  const lane = new Lane(admin, state);
  const finished = await lane.run();
  if (finished) {
    state.done = true;
    log("uzak hat bitti");
  } else if (lane.stopNow()) {
    state.done = true;
    state.stopReason = "03:30 sert durma";
    log("03:30 — durdu, kalan iş taşınmaz");
  }
  if (state.done) state.finishedAt = new Date().toISOString();
  saveState(state);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
