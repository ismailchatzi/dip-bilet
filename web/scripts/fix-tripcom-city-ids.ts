/**
 * Trip.com cityId doğrulama + SerpAPI adayları.
 * npx tsx --env-file=.env.local scripts/fix-tripcom-city-ids.ts
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CURRENT: Record<string, { id: number; expect: string[] }> = {
  ATH: { id: 710, expect: ["athens"] },
  BUD: { id: 637, expect: ["budapest"] },
  VIE: { id: 651, expect: ["vienna"] },
  PRG: { id: 1288, expect: ["prague"] },
  FCO: { id: 343, expect: ["rome"] },
  VCE: { id: 688, expect: ["venice"] },
  MUC: { id: 363, expect: ["munich"] },
  BER: { id: 193, expect: ["berlin"] },
  TBS: { id: 7612, expect: ["tbilisi"] },
  GYD: { id: 650, expect: ["baku"] },
  SJJ: { id: 10260, expect: ["sarajevo"] },
  BEG: { id: 10257, expect: ["belgrade"] },
  TIA: { id: 36649, expect: ["tirana"] },
  SKP: { id: 7617, expect: ["skopje"] },
  SSH: { id: 36242, expect: ["sharm"] },
  CDG: { id: 192, expect: ["paris"] },
  MAD: { id: 357, expect: ["madrid"] },
  BCN: { id: 40795, expect: ["barcelona"] },
  DPS: { id: 723, expect: ["bali"] },
  HKT: { id: 725, expect: ["phuket"] },
  MLE: { id: 1207, expect: ["male", "maldives"] },
  CPH: { id: 260, expect: ["copenhagen"] },
  BTS: { id: 4008, expect: ["bratislava"] },
  MSR: { id: 5332, expect: ["mus"] },
  LHR: { id: 338, expect: ["london"] },
  AMS: { id: 176, expect: ["amsterdam"] },
  DXB: { id: 220, expect: ["dubai"] },
  DOH: { id: 234, expect: ["doha"] },
  WAW: { id: 318, expect: ["warsaw"] },
  LIS: { id: 326, expect: ["lisbon"] },
  MXP: { id: 258, expect: ["milan"] },
  NCE: { id: 345, expect: ["nice"] },
  ARN: { id: 289, expect: ["stockholm"] },
  OSL: { id: 278, expect: ["oslo"] },
  HEL: { id: 251, expect: ["helsinki"] },
  DUB: { id: 250, expect: ["dublin"] },
  BRU: { id: 189, expect: ["brussels"] },
  ZRH: { id: 288, expect: ["zurich"] },
};

const NEED_FIND: Record<string, string[]> = {
  MXP: ["milan", "milano"],
  NCE: ["nice"],
  ARN: ["stockholm"],
  BRU: ["brussels", "bruxelles"],
  VLC: ["valencia"],
  KSY: ["kars"],
  ACC: ["accra"],
  BJL: ["banjul"],
  BAL: ["batman"],
  OGU: ["giresun", "ordu"],
  BHK: ["bukhara", "buhara"],
  MED: ["medina", "madinah"],
  EIN: ["eindhoven"],
  JED: ["jeddah", "jidda"],
  ERZ: ["erzurum"],
  BAH: ["bahrain", "manama"],
  LTN: ["london"],
  SHJ: ["dubai", "sharjah"],
  OTP: ["bucharest"],
  CAI: ["cairo"],
  CTA: ["catania"],
  CIT: ["shymkent", "chimkent"],
  AKX: ["aktobe"],
  UFA: ["ufa"],
  ADF: ["adiyaman"],
  NOP: ["sinop"],
  VAN: ["van"],
  ALG: ["algiers", "alger"],
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function titleMatches(title: string, expects: string[]) {
  const t = norm(title);
  if (!t || /404/.test(t)) return false;
  // boş "Where to stay in  |"
  if (/where to stay in\s+\|/i.test(title)) return false;
  return expects.some((e) => {
    const n = norm(e);
    if (n.length < 3) return false;
    const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    return re.test(t);
  });
}

async function titleFor(id: number) {
  const url = `https://www.trip.com/hotels/list?city=${id}&checkIn=2026-10-01&checkOut=2026-10-05&adult=2&crn=1&curr=USD&locale=en-XX`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  const html = await r.text();
  return (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").trim();
}

async function serpFind(name: string): Promise<number[]> {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) return [];
  const q = encodeURIComponent(`site:us.trip.com/hotels "${name}" hotels-list`);
  const r = await fetch(
    `https://serpapi.com/search.json?engine=google&q=${q}&num=10&api_key=${key}`,
  );
  if (!r.ok) return [];
  const j = (await r.json()) as { organic_results?: Array<{ link?: string }> };
  const ids: number[] = [];
  for (const row of j.organic_results ?? []) {
    const m = row.link?.match(/hotels-list-(\d+)/i);
    if (m) {
      const id = Number(m[1]);
      if (id > 0 && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

(async () => {
  console.log("=== Statik harita doğrulama ===");
  const good: Record<string, number> = {};
  const bad: string[] = [];
  for (const [iata, { id, expect }] of Object.entries(CURRENT)) {
    const title = await titleFor(id);
    const ok = titleMatches(title, expect);
    console.log(ok ? "OK" : "BAD", iata, id, title.slice(0, 70));
    if (ok) good[iata] = id;
    else bad.push(iata);
  }

  console.log("\n=== Bozuk / eksik şehir arama ===");
  const found: Record<string, number> = {};
  for (const [iata, expects] of Object.entries(NEED_FIND)) {
    if (good[iata]) {
      found[iata] = good[iata]!;
      continue;
    }
    let resolved: number | null = null;
    for (const name of expects) {
      const ids = await serpFind(name);
      for (const id of ids) {
        const title = await titleFor(id);
        if (titleMatches(title, expects)) {
          resolved = id;
          console.log("FOUND", iata, id, title.slice(0, 70), `(via ${name})`);
          break;
        }
        console.log("reject", iata, id, title.slice(0, 60));
      }
      if (resolved) break;
    }
    if (resolved) found[iata] = resolved;
    else console.log("NONE", iata, expects.join("|"));
  }

  console.log("\n=== FINAL MAP ===");
  const merged = { ...good, ...found };
  console.log(JSON.stringify(merged, null, 2));
  console.log("bad static:", bad);
})().catch(console.error);
