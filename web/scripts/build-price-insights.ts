/**
 * Fiyat özetleri — tarama gözlemlerinden şehir başına aylık / haftanın günü / yüzdelik.
 * Yalnız okur (price_observations) ve price_insights'a yazar; tarama defterine dokunmaz.
 *
 * npx tsx scripts/build-price-insights.ts          → hesapla + kaydet
 * npx tsx scripts/build-price-insights.ts --dry    → yalnız ekrana bas
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPriceInsights,
  savePriceInsights,
} from "@/lib/scan/price-insights-build";
import { cheapestDow, cheapestMonth, dowLabel, monthLabel } from "@/lib/price-insights";

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
  const dry = process.argv.includes("--dry");
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    process.exit(1);
  }
  const started = Date.now();
  const { insights, rows } = await buildPriceInsights(admin);
  console.log(`gözlem: ${rows} · şehir: ${insights.length} · ${Math.round((Date.now() - started) / 1000)} sn`);
  for (const i of insights) {
    const m = cheapestMonth(i);
    const d = cheapestDow(i.outDow);
    const q = i.quantiles;
    console.log(
      `${i.dest.padEnd(4)} örnek ${String(i.samples).padStart(5)} · p5 $${q[5]} · medyan $${q[50]} · en ucuz ay ${m ? `${monthLabel(m.month)} ($${m.median})` : "—"} · gidiş günü ${d ? dowLabel(d.dow) : "—"}`,
    );
  }
  if (dry) return;
  const saved = await savePriceInsights(admin, insights);
  if (!saved.ok) {
    console.error("kayıt hatası:", saved.error);
    process.exit(1);
  }
  console.log("price_insights güncellendi");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
