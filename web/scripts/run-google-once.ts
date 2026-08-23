/** Tek Google Deals turu. npx tsx scripts/run-google-once.ts */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSerpapiDealsScan } from "@/lib/scan/serpapi-deals-runner";

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
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase yok");
  const r = await runSerpapiDealsScan(admin);
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
