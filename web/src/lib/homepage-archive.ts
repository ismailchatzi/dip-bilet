import { archiveDeals } from "@/lib/archive-deals";
import {
  dealDestCode,
  displayDealDiscountPercent,
  isDomesticDeal,
} from "@/lib/deal-display";
import { destPhotoUrls } from "@/lib/destination-photos";
import { ARCHIVE_SHOW_MAX, mergeCityLows } from "@/lib/scan/deal-archive";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deal } from "@/lib/types";

const MIN_REAL_CARDS = 4;

function hasLocalPhoto(deal: Deal) {
  return destPhotoUrls(dealDestCode(deal) || deal.destination).length > 0;
}

function hasPhoto(deal: Deal) {
  return hasLocalPhoto(deal) || Boolean(deal.photoUrl?.trim());
}

/**
 * Anasayfa kartları: şehir başına bugüne kadar yakalanan en ucuz paket
 * (yurtdışı, görselli; yerel foto + yüksek indirim önce). Az kalırsa örnekler.
 */
export async function getHomepageArchive(): Promise<Deal[]> {
  const admin = createAdminClient();
  if (!admin) return archiveDeals;
  const { data, error } = await admin
    .from("scan_board")
    .select("lows:deals->cityLows, live:deals->deals, archive:deals->archive")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return archiveDeals;

  const row = data as {
    lows?: Deal[] | null;
    live?: Deal[] | null;
    archive?: Deal[] | null;
  };
  const cards = mergeCityLows(row.lows, row.live, row.archive)
    .filter((d) => !isDomesticDeal(d) && hasPhoto(d))
    .sort(
      (a, b) =>
        Number(hasLocalPhoto(b)) - Number(hasLocalPhoto(a)) ||
        (displayDealDiscountPercent(b) ?? 0) - (displayDealDiscountPercent(a) ?? 0),
    )
    .slice(0, ARCHIVE_SHOW_MAX);

  if (cards.length >= MIN_REAL_CARDS) return cards;
  return [...cards, ...archiveDeals].slice(0, ARCHIVE_SHOW_MAX);
}
