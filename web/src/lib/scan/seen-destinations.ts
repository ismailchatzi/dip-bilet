import { dealCityName, dealDestCode } from "@/lib/deal-display";
import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";
import type { Deal, SeenDestination } from "@/lib/types";

function maxIso(a: string, b: string) {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function minIso(a: string, b: string) {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function normalizeCode(code: string) {
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

/** Scrappa 21 + önceki katalog + bu turdaki kartlar → büyüyen şehir listesi. */
export function mergeSeenDestinations(
  previous: SeenDestination[] | undefined,
  deals: Deal[],
  nowIso = new Date().toISOString(),
): SeenDestination[] {
  const map = new Map<string, SeenDestination>();

  for (const row of previous ?? []) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    map.set(code, {
      code,
      name: row.name?.trim() || code,
      firstSeenAt: row.firstSeenAt || nowIso,
      lastSeenAt: row.lastSeenAt || row.firstSeenAt || nowIso,
    });
  }

  for (const dest of SCRAPPA_DESTINATIONS) {
    if (map.has(dest.code)) continue;
    map.set(dest.code, {
      code: dest.code,
      name: dest.name,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
    });
  }

  for (const deal of deals) {
    const code = normalizeCode(dealDestCode(deal));
    if (!code) continue;
    const name = dealCityName(deal) || code;
    const seenAt = deal.foundAt || deal.verifiedAt || nowIso;
    const prev = map.get(code);
    if (!prev) {
      map.set(code, {
        code,
        name,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      });
      continue;
    }
    map.set(code, {
      code,
      name: name.length > 1 ? name : prev.name,
      firstSeenAt: minIso(prev.firstSeenAt, seenAt),
      lastSeenAt: maxIso(prev.lastSeenAt, seenAt),
    });
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "tr", { sensitivity: "base" }),
  );
}

export function unionSeenDestinationRows(
  ...lists: Array<SeenDestination[] | undefined>
): SeenDestination[] {
  const map = new Map<string, SeenDestination>();
  for (const list of lists) {
    for (const row of list ?? []) {
      const code = normalizeCode(row.code);
      if (!code) continue;
      const prev = map.get(code);
      if (!prev) {
        map.set(code, {
          code,
          name: row.name?.trim() || code,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
        });
        continue;
      }
      map.set(code, {
        code,
        name: row.name?.trim() || prev.name,
        firstSeenAt: minIso(prev.firstSeenAt, row.firstSeenAt),
        lastSeenAt: maxIso(prev.lastSeenAt, row.lastSeenAt),
      });
    }
  }
  return [...map.values()];
}
