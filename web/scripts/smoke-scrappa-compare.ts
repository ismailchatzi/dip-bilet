/**
 * Elle vs worker farkı: aynı key ile minimal vs bizim param seti.
 * Key yazdırmaz. Kullanım: npx tsx scripts/smoke-scrappa-compare.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

async function hit(
  label: string,
  path: string,
  params: Record<string, string>,
  headers: Record<string, string>,
) {
  const qs = new URLSearchParams(params);
  const url = `https://scrappa.co${path}?${qs}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers, cache: "no-store" });
  const text = await res.text();
  let reason = "";
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    reason = String(
      j.last_failure_reason || j.failed_stage || j.error || j.message || "",
    );
  } catch {
    reason = text.slice(0, 120).replace(/\s+/g, " ");
  }
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      ms: Date.now() - t0,
      billed: res.headers.get("x-credits-charged") ?? res.headers.get("x-billed"),
      reason: reason.slice(0, 160),
      path,
      params,
    }),
  );
}

async function main() {
  loadEnv();
  const key = process.env.SCRAPPA_API_KEY?.trim();
  if (!key) {
    console.error("SCRAPPA_API_KEY yok");
    process.exit(1);
  }
  const keyHint = `${key.slice(0, 4)}…${key.slice(-4)} (len=${key.length})`;
  console.log("key", keyHint);

  const base = {
    origin: "SAW",
    destination: "ATH",
    departure_date: "2026-10-15",
    return_date: "2026-10-20",
  };

  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // 1) Docs-like minimal + yalnız x-api-key (playground benzeri)
  await hit(
    "rt-minimal-no-ua",
    "/api/flights/v2/round-trip",
    { ...base, currency: "USD" },
    { Accept: "application/json", "x-api-key": key },
  );

  // 2) Bizim worker header + param seti
  await hit(
    "rt-worker-full",
    "/api/flights/v2/round-trip",
    {
      ...base,
      currency: "USD",
      hl: "tr",
      gl: "tr",
      sort_by: "cheapest",
      max_stops: "one_or_fewer",
    },
    { Accept: "application/json", "x-api-key": key, "User-Agent": ua },
  );

  // 3) Worker params ama UA yok
  await hit(
    "rt-worker-params-no-ua",
    "/api/flights/v2/round-trip",
    {
      ...base,
      currency: "USD",
      hl: "tr",
      gl: "tr",
      sort_by: "cheapest",
      max_stops: "one_or_fewer",
    },
    { Accept: "application/json", "x-api-key": key },
  );

  // 4) One-way worker benzeri
  await hit(
    "ow-worker",
    "/api/flights/one-way",
    {
      origin: "SAW",
      destination: "ATH",
      departure_date: "2026-10-15",
      currency: "USD",
      hl: "tr",
      gl: "tr",
      sort_by: "cheapest",
      max_stops: "one_or_fewer",
    },
    { Accept: "application/json", "x-api-key": key, "User-Agent": ua },
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
