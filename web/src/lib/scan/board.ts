import type { SupabaseClient } from "@supabase/supabase-js";
import type { CityFaresPayload } from "@/lib/scan/city-cache";
import { DEPARTURE_LABEL } from "@/lib/scan/routes";
import type { DealsPayload } from "@/lib/types";

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

/** Cron: sadece güncellenen parçayı yazar, diğerini korur */
export async function patchScanBoard(
  admin: SupabaseClient,
  patch: {
    deals?: DealsPayload;
    cityFares?: CityFaresPayload;
  },
): Promise<{ ok: boolean; error?: string }> {
  const current = await readScanBoard(admin);
  const row = {
    id: 1,
    deals: patch.deals ?? current.deals,
    city_fares: patch.cityFares ?? current.cityFares,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("scan_board").upsert(row, {
    onConflict: "id",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
