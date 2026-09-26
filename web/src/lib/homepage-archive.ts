import { archiveDeals } from "@/lib/archive-deals";
import { archiveForHomepage } from "@/lib/scan/deal-archive";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deal } from "@/lib/types";

/** Anasayfa “Son yakalanan fırsatlar”: yurtdışı, uçuşu geçmiş; yoksa örnekler. */
export async function getHomepageArchive(): Promise<Deal[]> {
  const admin = createAdminClient();
  if (!admin) return archiveDeals;
  const { data, error } = await admin
    .from("scan_board")
    .select("archive:deals->archive")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return archiveDeals;
  const archive = (data as { archive?: Deal[] | null }).archive ?? [];
  const real = archiveForHomepage(archive);
  return real.length > 0 ? real : archiveDeals;
}
