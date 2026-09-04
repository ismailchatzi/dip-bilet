import { dealDestCode, isDomesticDeal } from "@/lib/deal-display";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import { clampDealStrikePrices } from "@/lib/scan/showcase-config";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal, DealsPayload } from "@/lib/types";

/** Anasayfaya düşmesi için uçuş gününden sonra beklenen gün (ertesi gün = 1). */
export const ARCHIVE_MIN_AGE_DAYS = 1;
/** Arşivde tutma süresi. */
export const ARCHIVE_KEEP_DAYS = 60;
/** Anasayfada gösterilecek kart tavanı. */
export const ARCHIVE_SHOW_MAX = 12;

export { familyLastDealFoundAt } from "@/lib/deal-display";

export function sortByFoundAt(deals: Deal[]) {
  return [...deals].sort((a, b) => {
    const fb = b.foundAt ?? "";
    const fa = a.foundAt ?? "";
    if (fb !== fa) return fb.localeCompare(fa);
    return (b.discountPercent ?? 0) - (a.discountPercent ?? 0);
  });
}

export function isLiveDeal(deal: Deal, today = turkeyTodayIso()) {
  return !deal.outboundDate || deal.outboundDate >= today;
}

export function isArchiveReady(deal: Deal, today = turkeyTodayIso()) {
  if (!deal.outboundDate) return false;
  return deal.outboundDate <= addDaysIso(today, -ARCHIVE_MIN_AGE_DAYS);
}

export function isWithinArchiveKeep(deal: Deal, today = turkeyTodayIso()) {
  if (!deal.outboundDate) return false;
  return deal.outboundDate >= addDaysIso(today, -ARCHIVE_KEEP_DAYS);
}

export function archiveTripKey(deal: Deal) {
  return `${dealDestCode(deal)}|${deal.outboundDate ?? ""}|${deal.returnDate ?? ""}`;
}

export function splitLiveAndArchive(
  candidates: Deal[],
  previousArchive: Deal[],
  today = turkeyTodayIso(),
): { live: Deal[]; archive: Deal[] } {
  const live = sortByFoundAt(
    candidates.filter((d) => isLiveDeal(d, today)),
  );
  const expired = candidates.filter((d) => !isLiveDeal(d, today));
  const seen = new Set<string>();
  const archive: Deal[] = [];
  for (const deal of [...expired, ...previousArchive]) {
    if (!isWithinArchiveKeep(deal, today)) continue;
    const key = archiveTripKey(deal);
    if (seen.has(key)) continue;
    seen.add(key);
    archive.push(deal);
  }
  archive.sort(
    (a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
  );
  return { live, archive };
}

export function foldShowcase(
  previous: DealsPayload | null | undefined,
  nextLiveCandidates: Deal[],
  foundAt = new Date().toISOString(),
  today = turkeyTodayIso(),
): { payload: DealsPayload; live: Deal[]; previousLive: Deal[] } {
  const previousLive = (previous?.deals ?? []).filter((d) =>
    isLiveDeal(d, today),
  );
  const held = [
    ...(previous?.archive ?? []),
    ...(previous?.deals ?? []).filter((d) => !isLiveDeal(d, today)),
  ];
  const { live, archive } = splitLiveAndArchive(
    nextLiveCandidates,
    held,
    today,
  );
  const liveSafe = live.map(clampDealStrikePrices);
  const archiveSafe = archive.map(clampDealStrikePrices);
  return {
    payload: {
      source: "cache",
      fetchedAt: foundAt,
      departure: DEPARTURE_LABEL,
      deals: liveSafe,
      archive: archiveSafe,
    },
    live: liveSafe,
    previousLive,
  };
}

export function archiveForHomepage(
  archive: Deal[],
  today = turkeyTodayIso(),
): Deal[] {
  return archive
    .filter((d) => isArchiveReady(d, today))
    .filter((d) => !isDomesticDeal(d))
    .sort(
      (a, b) =>
        (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
        (b.outboundDate ?? "").localeCompare(a.outboundDate ?? ""),
    )
    .slice(0, ARCHIVE_SHOW_MAX);
}
