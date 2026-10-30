/**
 * Haftada bir akşam — vitrine/uygulamaya çekme (mail + push).
 *
 * npx tsx scripts/send-weekly-vitrin-nudge.ts
 * npx tsx scripts/send-weekly-vitrin-nudge.ts --send
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchWeeklyVitrinNudges } from "@/lib/weekly-vitrin-nudge";
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
  const r = await dispatchWeeklyVitrinNudges(admin, { send });
  console.log(
    `weekly-nudge#${r.nudgeId ?? "-"} · profiller: ${r.profiles} · mail: ${r.mailed} · push: ${r.pushed}${send ? "" : " (kuru)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
