import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalDeal } from "@/lib/external/types";

export async function knownSourceIds(
  admin: SupabaseClient,
  source: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await admin
    .from("external_deals")
    .select("source_id")
    .eq("source", source)
    .in("source_id", ids);
  if (error) throw new Error(`external_deals okunamadı: ${error.message}`);
  return new Set((data ?? []).map((r) => r.source_id as string));
}

export async function saveExternalDeals(admin: SupabaseClient, deals: ExternalDeal[]) {
  if (deals.length === 0) return { ok: true as const, saved: 0 };
  const rows = deals.map((d) => ({
    source: d.source,
    source_id: d.sourceId,
    url: d.url,
    title: d.title,
    published_at: d.publishedAt,
    origin: d.origin,
    dest_code: d.destCode,
    price: d.price,
    currency: d.currency,
    trip_type: d.tripType,
    stops: d.stops,
    date_pairs: d.datePairs,
    details: d.details,
  }));
  const { error } = await admin
    .from("external_deals")
    .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, saved: rows.length };
}
