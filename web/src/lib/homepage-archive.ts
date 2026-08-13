import { archiveDeals } from "@/lib/archive-deals";
import { archiveForHomepage } from "@/lib/scan/deal-archive";
import { readScanBoard } from "@/lib/scan/board";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deal } from "@/lib/types";

/** Anasayfa: 2+ gün geçmiş gerçek kartlar; yoksa örnekler. */
export async function getHomepageArchive(): Promise<Deal[]> {
  const admin = createAdminClient();
  if (!admin) return archiveDeals;
  const board = await readScanBoard(admin);
  const real = archiveForHomepage(board.deals?.archive ?? []);
  return real.length > 0 ? real : archiveDeals;
}
