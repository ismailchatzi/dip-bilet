import { dealDestCode } from "@/lib/deal-display";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal, DealsPayload } from "@/lib/types";

/** Anasayfaya düşmesi için uçuş gününden sonra beklenen gün (ertesi gün = 1). */
export const ARCHIVE_MIN_AGE_DAYS = 1;
/** Arşivde tutma süresi. */
export const ARCHIVE_KEEP_DAYS = 60;
/** Anasayfada gösterilecek kart tavanı. */
export const ARCHIVE_SHOW_MAX = 12;

function latestDealActivityAt(deal: Deal): string {
  let latest = deal.foundAt ?? "";
  for (const opt of deal.dateOptions ?? []) {
    const t = opt.foundAt ?? "";
    if (t && t.localeCompare(latest) > 0) latest = t;
  }
  return latest;
}

export function sortByFoundAt(deals: Deal[]) {
  return [...deals].sort((a, b) => {
    const fb = latestDealActivityAt(b);
    const fa = latestDealActivityAt(a);
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
  return {
    payload: {
      source: "cache",
      fetchedAt: foundAt,
      departure: DEPARTURE_LABEL,
      deals: live,
      archive,
    },
    live,
    previousLive,
  };
}

export function archiveForHomepage(
  archive: Deal[],
  today = turkeyTodayIso(),
): Deal[] {
  return archive
    .filter((d) => isArchiveReady(d, today))
    .sort(
      (a, b) =>
        (b.discountPercent ?? 0) - (a.discountPercent ?? 0) ||
        (b.outboundDate ?? "").localeCompare(a.outboundDate ?? ""),
    )
    .slice(0, ARCHIVE_SHOW_MAX);
}
