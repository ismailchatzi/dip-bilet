import type { SupabaseClient } from "@supabase/supabase-js";
import {
  median,
  quantiles101,
  type PriceInsight,
  type PriceInsightDow,
  type PriceInsightMonth,
} from "@/lib/price-insights";
import {
  SCRAPPA_DESTINATIONS,
  cityAirportCodes,
  type ScrappaDestination,
} from "@/lib/scan/scrappa-targets";
import { addDaysIso, stayRange, turkeyTodayIso } from "@/lib/scan/trip-rules";

const PAGE = 1000;
const ISTANBUL = new Set(["IST", "SAW"]);
const MIN_MONTH_SAMPLES = 5;

type Row = {
  id: number;
  route_key: string;
  destination_code: string | null;
  outbound_date: string;
  price: number;
  observed_at: string;
};

type Leg = { from: string; to: string; date: string; price: number };

type Pair = { out: string; ret: string; total: number };

async function loadRecentRows(
  admin: SupabaseClient,
  sinceIso: string,
  todayIso: string,
): Promise<Row[]> {
  const first = await admin
    .from("price_observations")
    .select("id")
    .gte("observed_at", sinceIso)
    .order("observed_at", { ascending: true })
    .limit(1);
  if (first.error) throw new Error(first.error.message);
  let lastId = Number(first.data?.[0]?.id ?? 0) - 1;
  if (lastId < 0) return [];

  const rows: Row[] = [];
  for (;;) {
    const res = await admin
      .from("price_observations")
      .select("id, route_key, destination_code, outbound_date, price, observed_at")
      .eq("source", "scrappa_oneway")
      .gt("id", lastId)
      .gte("observed_at", sinceIso)
      .gte("outbound_date", todayIso)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (res.error) throw new Error(res.error.message);
    const data = (res.data ?? []) as Row[];
    for (const r of data) {
      const price = Number(r.price);
      if (r.route_key?.includes(">") && r.outbound_date && price > 0) {
        rows.push({ ...r, price });
      }
    }
    if (data.length < PAGE) break;
    lastId = Number(data[data.length - 1]!.id);
  }
  return rows;
}

/** Aynı rota + gün birden çok kez görüldüyse en son görülen fiyat. */
function latestLegs(rows: Row[]) {
  const latest = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.route_key}|${r.outbound_date}`;
    const prev = latest.get(key);
    if (!prev || r.observed_at > prev.observed_at) latest.set(key, r);
  }
  const byCity = new Map<string, Leg[]>();
  for (const r of latest.values()) {
    const city = (r.destination_code ?? "").toUpperCase();
    if (!city) continue;
    const [from, to] = r.route_key.split(">");
    if (!from || !to) continue;
    const list = byCity.get(city) ?? [];
    list.push({ from, to, date: r.outbound_date, price: r.price });
    byCity.set(city, list);
  }
  return byCity;
}

/** Vitrinle aynı kural: aynı varış havalimanı, şehir kalış aralığı, tarih çifti başına en ucuz. */
function syntheticPairs(dest: ScrappaDestination, legs: Leg[]): Pair[] {
  const [minNights, maxNights] = stayRange(dest.code);
  const airports = new Set(cityAirportCodes(dest));
  const inbound = new Map<string, Leg[]>();
  for (const l of legs) {
    if (!airports.has(l.from) || !ISTANBUL.has(l.to)) continue;
    const key = `${l.from}|${l.date}`;
    const list = inbound.get(key) ?? [];
    list.push(l);
    inbound.set(key, list);
  }
  const best = new Map<string, Pair>();
  for (const out of legs) {
    if (!ISTANBUL.has(out.from) || !airports.has(out.to)) continue;
    for (let n = minNights; n <= maxNights; n++) {
      const retDate = addDaysIso(out.date, n);
      for (const ret of inbound.get(`${out.to}|${retDate}`) ?? []) {
        const total = out.price + ret.price;
        const key = `${out.date}|${ret.date}`;
        const prev = best.get(key);
        if (!prev || total < prev.total) {
          best.set(key, { out: out.date, ret: ret.date, total });
        }
      }
    }
  }
  return [...best.values()];
}

function dowOf(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Gün başına en ucuz paket → haftanın günü medyanı. */
function dowStats(pairs: Pair[], pick: (p: Pair) => string): PriceInsightDow[] {
  const perDay = new Map<string, number>();
  for (const p of pairs) {
    const day = pick(p);
    const prev = perDay.get(day);
    if (prev === undefined || p.total < prev) perDay.set(day, p.total);
  }
  const byDow = new Map<number, number[]>();
  for (const [day, total] of perDay) {
    const dow = dowOf(day);
    const list = byDow.get(dow) ?? [];
    list.push(total);
    byDow.set(dow, list);
  }
  return [...byDow.entries()]
    .map(([dow, totals]) => ({
      dow,
      median: Math.round(median(totals)),
      samples: totals.length,
    }))
    .sort((a, b) => a.dow - b.dow);
}

function monthStats(pairs: Pair[]): PriceInsightMonth[] {
  const byMonth = new Map<string, Pair[]>();
  for (const p of pairs) {
    const m = p.out.slice(0, 7);
    const list = byMonth.get(m) ?? [];
    list.push(p);
    byMonth.set(m, list);
  }
  return [...byMonth.entries()]
    .filter(([, list]) => list.length >= MIN_MONTH_SAMPLES)
    .map(([month, list]) => {
      const best = list.reduce((a, b) => (b.total < a.total ? b : a));
      return {
        month,
        min: Math.round(best.total),
        median: Math.round(median(list.map((p) => p.total))),
        samples: list.length,
        bestOut: best.out,
        bestRet: best.ret,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function buildPriceInsights(
  admin: SupabaseClient,
  opts: { windowDays?: number; now?: Date } = {},
): Promise<{ insights: PriceInsight[]; rows: number }> {
  const windowDays = opts.windowDays ?? 21;
  const now = opts.now ?? new Date();
  const today = turkeyTodayIso(now);
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const rows = await loadRecentRows(admin, since, today);
  const byCity = latestLegs(rows);
  const generatedAt = now.toISOString();

  const insights: PriceInsight[] = [];
  for (const dest of SCRAPPA_DESTINATIONS) {
    const pairs = syntheticPairs(dest, byCity.get(dest.code) ?? []);
    if (pairs.length === 0) continue;
    insights.push({
      dest: dest.code,
      currency: "USD",
      generatedAt,
      windowDays,
      samples: pairs.length,
      months: monthStats(pairs),
      outDow: dowStats(pairs, (p) => p.out),
      retDow: dowStats(pairs, (p) => p.ret),
      quantiles: quantiles101(pairs.map((p) => p.total)),
    });
  }
  return { insights, rows: rows.length };
}

export async function savePriceInsights(
  admin: SupabaseClient,
  insights: PriceInsight[],
) {
  if (insights.length === 0) return { ok: true as const };
  const { error } = await admin.from("price_insights").upsert(
    insights.map((i) => ({
      dest_code: i.dest,
      data: i,
      updated_at: i.generatedAt,
    })),
    { onConflict: "dest_code" },
  );
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function readPriceInsights(
  admin: SupabaseClient,
  dest?: string,
): Promise<Record<string, PriceInsight>> {
  let q = admin.from("price_insights").select("dest_code, data");
  if (dest) q = q.eq("dest_code", dest.toUpperCase());
  const { data, error } = await q;
  if (error || !data) return {};
  const out: Record<string, PriceInsight> = {};
  for (const row of data as { dest_code: string; data: PriceInsight }[]) {
    out[row.dest_code] = row.data;
  }
  return out;
}
