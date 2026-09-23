/**
 * A/B one-way + rematch özeti. Kullanım: npx tsx scripts/scrappa-status.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { readScanBoard } from "@/lib/scan/board";
import { jobFromPayload } from "@/lib/scan/scrappa-job";
import { rematchJobFromPayload } from "@/lib/scan/scrappa-rematch";
import { bindLaneApiKey } from "@/lib/scan/scrappa-lane";
import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

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

function destCode(index?: number) {
  if (typeof index !== "number") return "?";
  return SCRAPPA_DESTINATIONS[index]?.code ?? `idx${index}`;
}

async function main() {
  loadEnv();
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    process.exit(1);
  }

  for (const lane of ["a", "b"] as const) {
    bindLaneApiKey(lane);
    const deals = (await readScanBoard(admin)).deals;
    const j = jobFromPayload(deals);
    const r = rematchJobFromPayload(deals);
    console.log(
      lane,
      JSON.stringify(
        {
          oneWay: j
            ? {
                status: j.status,
                window: j.window,
                dest: destCode(j.destIndex),
                destIndex: j.destIndex,
                lastError: j.lastError,
                heartbeatAt: j.heartbeatAt,
              }
            : null,
          rematch: r
            ? {
                status: r.status,
                phase: r.phase,
                dest: destCode(r.destIndex),
                destIndex: r.destIndex,
                lastError: r.lastError,
                heartbeatAt: r.heartbeatAt,
              }
            : null,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
