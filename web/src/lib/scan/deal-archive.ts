import {
  dealDateChoices,
  dealDestCode,
  dealWithDateChoice,
  dealWithinStopLimit,
  familyLastDealFoundAt,
  isDomesticDeal,
  isFoundAtWithinKeep,
  isUnverifiedOneWaySum,
  promoteFreshHeroDeal,
  enforceDealThreshold,
  SHOWCASE_FOUND_KEEP_DAYS,
} from "@/lib/deal-display";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import { mergeSeenDestinations } from "@/lib/scan/seen-destinations";
import { clampDealStrikePrices } from "@/lib/scan/showcase-config";
import { addDaysIso, turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal, DealsPayload } from "@/lib/types";

/** Anasayfaya düşmesi için uçuş gününden sonra beklenen gün (ertesi gün = 1). */
export const ARCHIVE_MIN_AGE_DAYS = 1;
/** Arşivde tutma süresi. */
export const ARCHIVE_KEEP_DAYS = 60;
/** Anasayfada gösterilecek kart tavanı. */
export const ARCHIVE_SHOW_MAX = 12;

export { SHOWCASE_FOUND_KEEP_DAYS, familyLastDealFoundAt };

export function sortByFoundAt(deals: Deal[]) {
  return [...deals].sort((a, b) => {
    const fb = b.foundAt ?? "";
    const fa = a.foundAt ?? "";
    if (fb !== fa) return fb.localeCompare(fa);
    return (b.discountPercent ?? 0) - (a.discountPercent ?? 0);
  });
}

/**
 * Kart kalsın mı: hero veya diğer tarihlerde keep içi yakalanma var mı?
 * (Etiket eski olsa bile taze seçenek varsa true.)
 */
export function isWithinFoundAge(deal: Deal, today = turkeyTodayIso()) {
  const latest = familyLastDealFoundAt(deal) || deal.foundAt;
  return isFoundAtWithinKeep(latest, today);
}

function isLiveByOutbound(deal: Deal, today: string) {
  return !deal.outboundDate || deal.outboundDate >= today;
}

/** Canlı vitrin: keep içi + uçuşu gelmemiş en az bir seçenek (hero taze/ucuz yükseltilir). */
export function isLiveDeal(deal: Deal, today = turkeyTodayIso()) {
  return promoteFreshHeroDeal(deal, today) != null;
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
  // Yalnız uçuşu geçenler arşive; foundAt aşımı vitrinden silinir, arşive de yazılmaz.
  const flightExpired = candidates.filter(
    (d) => isWithinFoundAge(d, today) && !isLiveByOutbound(d, today),
  );
  const seen = new Set<string>();
  const archive: Deal[] = [];
  for (const deal of [...flightExpired, ...previousArchive]) {
    // Yakalanma aşımı + uçuş gelecekte → ne vitrin ne arşiv
    if (!isWithinFoundAge(deal, today) && isLiveByOutbound(deal, today)) {
      continue;
    }
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

/** Silinebilen manual kartlar rekora girmez; yoksa silinen fiyat anasayfada kalır. */
function isCityLowCandidate(deal: Deal) {
  return (
    !deal.id.startsWith("manual:") &&
    deal.price > 0 &&
    Boolean(dealDestCode(deal)) &&
    dealWithinStopLimit(deal) &&
    !isUnverifiedOneWaySum(deal)
  );
}

/**
 * Şehir başına bugüne kadar vitrine girmiş en ucuz paket (diğer tarihler dahil).
 * Eşitlikte ilk yakalanan kalır.
 */
export function mergeCityLows(
  ...lists: (Deal[] | null | undefined)[]
): Deal[] {
  const best = new Map<string, Deal>();
  for (const list of lists) {
    for (const deal of list ?? []) {
      const trips = [deal, ...dealDateChoices(deal).map((c) => dealWithDateChoice(deal, c))];
      for (const trip of trips) {
        if (!isCityLowCandidate(trip)) continue;
        const key = dealDestCode(trip);
        const cur = best.get(key);
        const tf = trip.foundAt ?? "";
        const cf = cur?.foundAt ?? "";
        if (
          !cur ||
          trip.price < cur.price ||
          (trip.price === cur.price && tf !== "" && (cf === "" || tf < cf))
        ) {
          best.set(key, { ...trip, dateOptions: undefined });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) =>
    dealDestCode(a).localeCompare(dealDestCode(b)),
  );
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
    // Yalnız uçuşu geçenler arşiv adayı; foundAt aşımı burada tutulmaz.
    ...(previous?.deals ?? []).filter((d) => !isLiveByOutbound(d, today)),
  ];
  const { live, archive } = splitLiveAndArchive(
    nextLiveCandidates
      .map(enforceDealThreshold)
      .filter((d): d is Deal => d != null),
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
      cityLows: mergeCityLows(previous?.cityLows, liveSafe, archiveSafe),
      seenDestinations: mergeSeenDestinations(
        previous?.seenDestinations,
        [...liveSafe, ...archiveSafe],
        foundAt,
      ),
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
