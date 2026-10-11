/**
 * Dış kaynak fırsatlarını (external_deals) Scrappa gidiş-dönüşle doğrular;
 * fiyat tutarsa vitrine kaynağın tam fiyatıyla E kartı olarak ekler.
 *
 * Tarama düzenine dokunmaz: A hattı (near / rematch) çalışırken, B rematch'i sürerken,
 * A işçisi canlıyken (uzak tarama dahil — o turu kendi içinde yapar) veya 03:40–04:20 TR
 * arası hiç Scrappa çağrısı yapmaz.
 *
 * npx tsx scripts/external-verify.ts            → 15 dk cron
 * npx tsx scripts/external-verify.ts --dry      → adayları listele (Scrappa yok, yazma yok)
 * npx tsx scripts/external-verify.ts --no-write → Scrappa'ya sor, vitrine / DB'ye yazma
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runExternalVerifyRound } from "@/lib/external/verify-round";

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
  const args = new Set(process.argv.slice(2));
  const dry = args.has("--dry");
  await runExternalVerifyRound({ dry, noWrite: dry || args.has("--no-write") });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
