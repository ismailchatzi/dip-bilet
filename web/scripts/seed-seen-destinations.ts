import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { emptyDealsPayload, patchScanBoard, readScanBoard } from "../src/lib/scan/board";
import { mergeSeenDestinations } from "../src/lib/scan/seen-destinations";
import { optionsFromSeenDestinations } from "../src/lib/destinations";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const board = await readScanBoard(admin);
  const deals = board.deals ?? emptyDealsPayload();
  const catalog = mergeSeenDestinations(
    deals.seenDestinations,
    [...(deals.deals ?? []), ...(deals.archive ?? [])],
    new Date().toISOString(),
  );
  const patched = await patchScanBoard(admin, {
    deals: { ...deals, seenDestinations: catalog },
  });
  const options = optionsFromSeenDestinations(catalog);
  writeFileSync(
    "tmp-seen-dest.json",
    JSON.stringify(
      {
        ok: patched.ok,
        error: patched.error,
        catalogSize: catalog.length,
        sample: options.slice(0, 15),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  writeFileSync("tmp-seen-dest.json", JSON.stringify({ error: String(e) }, null, 2));
  process.exit(1);
});
