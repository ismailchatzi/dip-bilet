/**
 * Pilot: Roma (FCO) 6 ay, tek yön × 4 bacak, 1 kez.
 * İlk 4 gün atlanır. ~700 kredi.
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");

function loadKey() {
  const raw = readFileSync(join(webRoot, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*SCRAPPA_API_KEY\s*=\s*(.+)\s*$/);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
  }
  throw new Error("SCRAPPA_API_KEY yok");
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function monthKey(iso) {
  return iso.slice(0, 7);
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function oneWay(key, origin, destination, date) {
  const params = new URLSearchParams({
    origin,
    destination,
    departure_date: date,
    currency: "USD",
    hl: "tr",
    gl: "tr",
    sort_by: "cheapest",
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `https://scrappa.co/api/flights/one-way?${params}`,
      { headers: { Accept: "application/json", "x-api-key": key } },
    );
    if (res.status === 429 || res.status === 503) {
      await sleep(1500 * attempt);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} ${origin}->${destination} ${date} ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const flights = (json.flights || []).filter((f) => typeof f.price === "number" && f.price > 0);
    flights.sort((a, b) => a.price - b.price);
    const best = flights[0];
    if (!best) return null;
    return {
      origin,
      destination,
      date,
      price: best.price,
      currency: "USD",
      airline: best.airline_name || best.legs?.[0]?.airline || null,
      stops: best.stops ?? best.legs?.[0]?.stops ?? null,
      durationMin: best.total_duration_minutes ?? null,
    };
  }
  throw new Error(`retry bitti ${origin}->${destination} ${date}`);
}

const LEGS = [
  { origin: "IST", destination: "FCO", dir: "out" },
  { origin: "SAW", destination: "FCO", dir: "out" },
  { origin: "FCO", destination: "IST", dir: "ret" },
  { origin: "FCO", destination: "SAW", dir: "ret" },
];

const key = loadKey();
const today = isoDate(new Date());
const start = addDays(today, 4);
const end = addDays(today, 182);
const dates = [];
for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

console.log(`PILOT FCO ${start} → ${end}  days=${dates.length}  calls=${dates.length * 4}`);

const rows = [];
let ok = 0;
let empty = 0;
let err = 0;

for (let i = 0; i < dates.length; i++) {
  const date = dates[i];
  for (const leg of LEGS) {
    try {
      const row = await oneWay(key, leg.origin, leg.destination, date);
      if (row) {
        rows.push({ ...row, dir: leg.dir });
        ok++;
        console.log(`  ${leg.origin}->${leg.destination} ${date}  ${row.price} ${row.airline || ""}`);
      } else {
        empty++;
        console.log(`  ${leg.origin}->${leg.destination} ${date}  EMPTY`);
      }
    } catch (e) {
      err++;
      console.log(`  ERR ${leg.origin}->${leg.destination} ${date}  ${e.message}`);
      await sleep(800);
    }
    await sleep(120);
  }
}

function byLeg(origin, dest) {
  return rows.filter((r) => r.origin === origin && r.destination === dest);
}

function cheapest4(list) {
  return [...list].sort((a, b) => a.price - b.price).slice(0, 4);
}

const outDir = join(webRoot, ".data");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "scrappa-pilot-fco.json");
writeFileSync(
  outFile,
  JSON.stringify({ today, start, end, ok, empty, err, rows }, null, 2),
);

console.log("\n==== KAYIT ====");
console.log(outFile);
console.log(`ok=${ok} empty=${empty} err=${err}`);

console.log("\n==== AYIN EN UCUZ 4 GUNU + MEDYAN ====");
const months = [...new Set(rows.map((r) => monthKey(r.date)))].sort();
const medians = {};

for (const m of months) {
  console.log(`\n-- ${m} --`);
  for (const leg of LEGS) {
    const list = byLeg(leg.origin, leg.destination).filter((r) => monthKey(r.date) === m);
    const med = median(list.map((r) => r.price));
    const k = `${m}|${leg.origin}|${leg.destination}`;
    medians[k] = med;
    const top = cheapest4(list);
    const label = `${leg.origin}->${leg.destination}`;
    console.log(
      `  ${label}  n=${list.length}  medyan=${med ?? "-"}  en ucuz4: ${top
        .map((t) => `${t.date}:${t.price}`)
        .join(" | ")}`,
    );
  }
}

console.log("\n==== ESIK ADAYI (Avrupa 4-10 gece, %20 alti) ====");
const outs = rows.filter((r) => r.dir === "out");
const rets = rows.filter((r) => r.dir === "ret");
const hits = [];

for (const o of outs) {
  const m = monthKey(o.date);
  const outMed = medians[`${m}|${o.origin}|${o.destination}`];
  for (const r of rets) {
    if (r.date <= o.date) continue;
    const nights =
      (new Date(`${r.date}T12:00:00Z`) - new Date(`${o.date}T12:00:00Z`)) /
      86400000;
    if (nights < 4 || nights > 10) continue;
    const retMed = medians[`${m}|${r.origin}|${r.destination}`];
    if (!outMed || !retMed) continue;
    const M = outMed + retMed;
    const total = o.price + r.price;
    if (total > M * 0.8) continue;
    hits.push({
      out: `${o.origin}->${o.destination} ${o.date} ${o.price}`,
      ret: `${r.origin}->${r.destination} ${r.date} ${r.price}`,
      nights,
      total,
      M: Math.round(M * 100) / 100,
      strike: Math.round(M * 1.1),
      threshold: Math.round(M * 0.9),
      pct: Math.round((1 - total / M) * 100),
    });
  }
}

hits.sort((a, b) => a.total - b.total);
const unique = [];
const seen = new Set();
for (const h of hits) {
  const k = `${h.out}|${h.ret}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(h);
  if (unique.length >= 8) break;
}

if (unique.length === 0) {
  console.log("Eşik altı paket yok (beklenen: ilk taramada çoğu 118$ bandı).");
} else {
  for (const h of unique) {
    console.log(
      `  ${h.out}  +  ${h.ret}  ${h.nights}gece  toplam=${h.total}  medyan=${h.M}  ~~${h.strike}~~  esik=${h.threshold}  %${h.pct}`,
    );
  }
}
