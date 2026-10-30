/**
 * Üye fiyat alarmları — vitrindeki canlı fırsatları alarmlarla eşler.
 *
 * npx tsx scripts/send-price-alerts.ts          → kuru çalışma
 * npx tsx scripts/send-price-alerts.ts --send   → e-posta + push (açıksa)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchPriceAlerts } from "@/lib/send-price-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

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

async function main() {
  loadEnv();
  const send = process.argv.includes("--send");
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    process.exit(1);
  }

  const r = await dispatchPriceAlerts(admin, { send });
  if (r.alerts === 0) {
    console.log("alarm yok");
    return;
  }
  console.log(
    `alarm: ${r.alerts} · eşleşen: ${r.matched} · mail: ${r.mailed} · push: ${r.pushed}${send ? "" : " (kuru çalışma)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
