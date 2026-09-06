import type { SupabaseClient } from "@supabase/supabase-js";
import type { CityFaresPayload } from "@/lib/scan/city-cache";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import {
  mergeSeenDestinations,
  unionSeenDestinationRows,
} from "@/lib/scan/seen-destinations";
import type { DealsPayload, ScrappaJob, ScrappaRematchJob } from "@/lib/types";

export type ScanBoard = {
  deals: DealsPayload | null;
  cityFares: CityFaresPayload | null;
  updatedAt: string | null;
};

const EMPTY_DEALS: DealsPayload = {
  source: "cache",
  fetchedAt: new Date(0).toISOString(),
  departure: DEPARTURE_LABEL,
  deals: [],
  archive: [],
};

export function emptyDealsPayload(): DealsPayload {
  return { ...EMPTY_DEALS, fetchedAt: new Date().toISOString() };
}

export async function readScanBoard(
  client: SupabaseClient,
): Promise<ScanBoard> {
  const { data, error } = await client
    .from("scan_board")
    .select("deals, city_fares, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return { deals: null, cityFares: null, updatedAt: null };
  }

  return {
    deals: (data.deals as DealsPayload | null) ?? null,
    cityFares: (data.city_fares as CityFaresPayload | null) ?? null,
    updatedAt: data.updated_at ?? null,
  };
}

function newerByHeartbeat<T extends { heartbeatAt: string }>(
  a?: T | null,
  b?: T | null,
) {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return Date.parse(a.heartbeatAt) >= Date.parse(b.heartbeatAt) ? a : b;
}

function newerScrappaJob(a?: ScrappaJob | null, b?: ScrappaJob | null) {
  return newerByHeartbeat(a, b);
}

function newerRematchJob(
  a?: ScrappaRematchJob | null,
  b?: ScrappaRematchJob | null,
) {
  return newerByHeartbeat(a, b);
}

/** Cron: sadece güncellenen parçayı yazar, diğerini korur */
export async function patchScanBoard(
  admin: SupabaseClient,
  patch: {
    deals?: DealsPayload;
    cityFares?: CityFaresPayload;
  },
): Promise<{ ok: boolean; error?: string }> {
  const current = await readScanBoard(admin);
  const incoming = patch.deals;
  const latest = incoming ? await readScanBoard(admin) : current;
  const deals = incoming
    ? {
        ...incoming,
        scrappaJob: newerScrappaJob(
          incoming.scrappaJob,
          newerScrappaJob(latest.deals?.scrappaJob, current.deals?.scrappaJob),
        ),
        scrappaRematchJob: newerRematchJob(
          incoming.scrappaRematchJob,
          newerRematchJob(
            latest.deals?.scrappaRematchJob,
            current.deals?.scrappaRematchJob,
          ),
        ),
        // Katalog küçülmesin: önceki board + gelen payload birleşir.
        seenDestinations: mergeSeenDestinations(
          unionSeenDestinationRows(
            current.deals?.seenDestinations,
            latest.deals?.seenDestinations,
            incoming.seenDestinations,
          ),
          [...(incoming.deals ?? []), ...(incoming.archive ?? [])],
          incoming.fetchedAt,
        ),
      }
    : current.deals;
  const row = {
    id: 1,
    deals,
    city_fares: patch.cityFares ?? current.cityFares,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("scan_board").upsert(row, {
    onConflict: "id",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
