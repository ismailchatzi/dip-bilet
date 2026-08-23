/**
 * Vitrini boşalt + Scrappa job'u halt et.
 * npx tsx scripts/clear-showcase.ts
 *
 * Uyarı: scan_board paylaşımlı — dipbilet.com vitrini de boşalır.
 * Tarama halt.ts ile kapalı olmalı.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEPARTURE_LABEL } from "../src/lib/scan/routes";

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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env yok");

  const admin = createClient(url, key);
  const now = new Date().toISOString();
  const deals = {
    source: "cache" as const,
    fetchedAt: now,
    departure: DEPARTURE_LABEL,
    deals: [] as [],
    archive: [] as [],
    warning: "Yeni strateji — vitrin sıfırlandı",
    scrappaJob: {
      status: "idle" as const,
      window: "near" as const,
      destIndex: 0,
      dateIndex: 0,
      legIndex: 0,
      queue: [] as [],
      heartbeatAt: now,
      startedAt: now,
      scanned: 0,
      saved: 0,
      halted: true,
    },
  };

  const { error } = await admin.from("scan_board").upsert(
    {
      id: 1,
      deals,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("OK: vitrin boş, scrappaJob.halted=true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
