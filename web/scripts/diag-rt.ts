/**
 * Paket (round-trip) teşhisi — Scrappa ham cevabını özetler, tam halini tmp-diag-rt.json'a yazar.
 * B anahtarıyla çalışır; B işçisi varken ve 03:45–04:30 TR arasında çalışmaz.
 *
 *   npx tsx scripts/diag-rt.ts                          → IST SYD 2026-12-20 2026-12-30, max 1 aktarma
 *   npx tsx scripts/diag-rt.ts IST SYD 2026-12-20 2026-12-30 --stops 2
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import { otherLiveWorkerPid } from "@/lib/scan/scrappa-worker-lock";

type Flight = Record<string, unknown> & {
  price?: number;
  airline?: string;
  airline_name?: string;
  departure_token?: string;
  stops?: number;
  outbound_stops?: number | null;
  return_stops?: number | null;
  itinerary_complete?: boolean;
  price_type?: string;
  legs?: { stops?: number; airline?: string }[];
};

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

function trMinute() {
  const tr = new Date(Date.now() + 3 * 3600_000);
  return tr.getUTCHours() * 60 + tr.getUTCMinutes();
}

function stopsOf(f: Flight) {
  if (typeof f.stops === "number") return f.stops;
  const out = typeof f.outbound_stops === "number" ? f.outbound_stops : null;
  const ret = typeof f.return_stops === "number" ? f.return_stops : null;
  if (out != null && ret != null) return Math.max(out, ret);
  if (out != null) return out;
  if (typeof f.legs?.[0]?.stops === "number") return f.legs[0].stops;
  return null;
}

function brief(f: Flight) {
  return {
    price: f.price ?? null,
    airline: f.airline ?? f.airline_name ?? null,
    stops: f.stops ?? null,
    out_stops: f.outbound_stops ?? null,
    ret_stops: f.return_stops ?? null,
    legs: f.legs?.map((l) => l.stops ?? "?").join("/") ?? null,
    price_type: f.price_type ?? null,
    complete: f.itinerary_complete ?? null,
    token: typeof f.departure_token === "string" && f.departure_token.length > 0,
  };
}

async function call(params: URLSearchParams, apiKey: string) {
  const t0 = Date.now();
  const res = await fetch(`https://scrappa.co/api/flights/v2/round-trip?${params}`, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ms: Date.now() - t0, json };
}

function report(label: string, r: { status: number; ms: number; json: Record<string, unknown> }, maxStops: number) {
  const flights = (Array.isArray(r.json.flights) ? r.json.flights : []) as Flight[];
  const priced = flights.filter((f) => typeof f.price === "number" && f.price > 0);
  const pass = priced.filter((f) => {
    const s = stopsOf(f);
    return s == null || s <= maxStops;
  });
  console.log(`\n== ${label}: HTTP ${r.status} · ${Math.round(r.ms / 1000)} sn · uçuş ${flights.length} · fiyatlı ${priced.length} · filtreden geçen ${pass.length}`);
  for (const k of ["error", "message", "failed_stage", "last_failure_reason"]) {
    if (r.json[k]) console.log(`   ${k}: ${String(r.json[k]).slice(0, 200)}`);
  }
  if (flights[0]) console.log(`   alanlar: ${Object.keys(flights[0]).join(", ")}`);
  const top = [...flights].sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9)).slice(0, 6);
  for (const f of top) console.log(`   ${JSON.stringify(brief(f))}`);
  return { flights, pass };
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--stops");
  const maxStops = si >= 0 ? Number(argv[si + 1]) : 1;
  const pos = argv.filter((a, i) => !a.startsWith("--") && (si < 0 || i !== si + 1));
  const [origin = "IST", dest = "SYD", out = "2026-12-20", ret = "2026-12-30"] = pos;

  const m = trMinute();
  if (m >= 3 * 60 + 45 && m < 4 * 60 + 30) throw new Error("03:45–04:30 arası çalışmaz (tarama başlangıcı)");
  const busy = otherLiveWorkerPid("b");
  if (busy != null) throw new Error(`B işçisi çalışıyor (pid ${busy}) — çıkış`);
  const bound = bindLaneApiKey("b");
  if (!bound.ok) throw new Error(bound.error);
  const apiKey = process.env.SCRAPPA_API_KEY!.trim();

  console.log(`${origin}→${dest} ${out} / ${ret} · max ${maxStops} aktarma`);
  const params = new URLSearchParams({
    origin,
    destination: dest,
    departure_date: out,
    return_date: ret,
    currency: "USD",
    hl: "tr",
    gl: "tr",
    sort_by: "cheapest",
    max_stops: maxStops >= 2 ? "two_or_fewer" : "one_or_fewer",
  });

  const dump: Record<string, unknown> = {};
  const outRes = await call(params, apiKey);
  dump.outbound = outRes.json;
  const { pass } = report("GİDİŞ LİSTESİ", outRes, maxStops);
  const ranked = pass
    .filter((f) => typeof f.departure_token === "string" && f.departure_token.length > 0)
    .sort((a, b) => a.price! - b.price!)
    .slice(0, 2);
  if (ranked.length === 0) console.log("\n>> Filtreden geçen, token'lı gidiş yok — paket adımına geçilemedi.");

  for (let i = 0; i < ranked.length; i++) {
    const p = new URLSearchParams(params);
    p.set("departure_token", ranked[i]!.departure_token!);
    await new Promise((r) => setTimeout(r, 2000));
    const res = await call(p, apiKey);
    dump[`complete${i + 1}`] = res.json;
    const { pass: ok } = report(`PAKET ${i + 1} (gidiş $${ranked[i]!.price} ${ranked[i]!.airline ?? ""})`, res, maxStops);
    console.log(ok.length > 0 ? `>> Paket bulundu: $${Math.min(...ok.map((f) => f.price!))}` : ">> Paket yok (bizim sistem burada 'boş' der)");
  }

  writeFileSync(resolve(process.cwd(), "tmp-diag-rt.json"), JSON.stringify(dump, null, 2));
  console.log("\nHam cevap: tmp-diag-rt.json");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
