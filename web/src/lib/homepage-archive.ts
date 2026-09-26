import { archiveDeals } from "@/lib/archive-deals";
import {
  dealDestCode,
  dealWithinStopLimit,
  isDomesticDeal,
  isUnverifiedOneWaySum,
  vitrinHeroDeals,
} from "@/lib/deal-display";
import { destPhotoUrls } from "@/lib/destination-photos";
import {
  ARCHIVE_SHOW_MAX,
  archiveForHomepage,
  isLiveDeal,
} from "@/lib/scan/deal-archive";
import { turkeyTodayIso } from "@/lib/scan/trip-rules";
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
 * Anasayfa “Son yakalanan fırsatlar”: canlı vitrin kahramanları (yurtdışı, görselli,
 * yerel foto + yüksek indirim önce), sonra uçuşu geçmiş arşiv; az kalırsa örnekler.
 */
export async function getHomepageArchive(): Promise<Deal[]> {
  const admin = createAdminClient();
  if (!admin) return archiveDeals;
  const { data, error } = await admin
    .from("scan_board")
    .select("archive:deals->archive, live:deals->deals")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return archiveDeals;

  const row = data as { archive?: Deal[] | null; live?: Deal[] | null };
  const today = turkeyTodayIso();

  const live = vitrinHeroDeals(
    (row.live ?? []).filter(
      (d) =>
        isLiveDeal(d, today) &&
        dealWithinStopLimit(d) &&
        !isUnverifiedOneWaySum(d),
    ),
    today,
  )
    .filter((d) => !isDomesticDeal(d) && hasPhoto(d))
    .sort(
      (a, b) =>
        Number(hasLocalPhoto(b)) - Number(hasLocalPhoto(a)) ||
        (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
    );
  const past = archiveForHomepage(row.archive ?? [], today).filter(hasPhoto);

  const seen = new Set<string>();
  const cards: Deal[] = [];
  for (const deal of [...live, ...past]) {
    const key = dealDestCode(deal) || deal.destination;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(deal);
    if (cards.length >= ARCHIVE_SHOW_MAX) break;
  }

  if (cards.length >= MIN_REAL_CARDS) return cards;
  return [...cards, ...archiveDeals].slice(0, ARCHIVE_SHOW_MAX);
}
