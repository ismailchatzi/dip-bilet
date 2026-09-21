import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { readScanBoard, patchScanBoard } from "../src/lib/scan/board";
import { enforceDealThreshold } from "../src/lib/deal-display";
import { foldShowcase } from "../src/lib/scan/deal-archive";

for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split(
  "\n",
)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const board = await readScanBoard(admin);
  const before = board.deals?.deals ?? [];
  const bad = before.filter((d) => {
    const e = enforceDealThreshold(d);
    return (
      e == null ||
      e.price !== d.price ||
      (d.dateOptions?.length ?? 0) !== (e.dateOptions?.length ?? 0)
    );
  });
  console.log(
    "before",
    before.length,
    "need_scrub",
    bad.length,
    bad.slice(0, 12).map((d) => ({
      dest: d.destination,
      price: d.price,
      thr: d.thresholdPrice,
      id: d.id.slice(0, 48),
    })),
  );
  const { payload, live } = foldShowcase(board.deals, before);
  const saved = await patchScanBoard(admin, { deals: payload });
  console.log("after", live.length, "ok", saved.ok, saved.error ?? "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
