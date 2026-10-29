import type { SupabaseClient } from "@supabase/supabase-js";

function destCodesFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is string => typeof c === "string" && c.trim() !== "")
    .map((c) => c.trim().toUpperCase());
}

export async function loadProfilePrefs(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from("profiles")
    .select("departure_code, destination_codes, email_alerts, phone, phone_verified")
    .eq("id", userId)
    .maybeSingle();
  return {
    departureCode: (data?.departure_code as string | undefined) || "IST",
    destinationCodes: destCodesFrom(data?.destination_codes),
    emailAlerts: data?.email_alerts !== false,
    phone: (data?.phone as string | undefined) || "",
    phoneVerified: Boolean(data?.phone_verified),
  };
}

export type PriceAlertRow = {
  id: number;
  dest_code: string;
  max_price: number;
  currency?: string;
  month?: string | null;
};

export async function listPriceAlerts(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("price_alerts")
    .select("id, dest_code, max_price, currency, month")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PriceAlertRow[];
}

export async function deletePriceAlert(client: SupabaseClient, id: number) {
  const { error } = await client.from("price_alerts").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleDreamDest(
  client: SupabaseClient,
  userId: string,
  email: string,
  code: string,
) {
  const dest = code.trim().toUpperCase();
  const { data } = await client
    .from("profiles")
    .select("destination_codes")
    .eq("id", userId)
    .maybeSingle();
  const current = destCodesFrom(data?.destination_codes);
  const next = current.includes(dest)
    ? current.filter((c) => c !== dest)
    : [...current, dest];
  const { error } = await client.from("profiles").upsert(
    {
      id: userId,
      email,
      destination_codes: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return next;
}

export async function setEmailAlerts(
  client: SupabaseClient,
  userId: string,
  email: string,
  on: boolean,
) {
  const { error } = await client.from("profiles").upsert(
    {
      id: userId,
      email,
      email_alerts: on,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function createPriceAlert(
  client: SupabaseClient,
  userId: string,
  destCode: string,
  maxPrice: number,
) {
  const dest = destCode.trim().toUpperCase();
  const price = Math.round(maxPrice);
  if (!Number.isFinite(price) || price < 20 || price > 5000) {
    throw new Error("Fiyat 20–5000 $ arası olmalı");
  }
  const { count } = await client
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("user_id", userId);
  if ((count ?? 0) >= 10) throw new Error("En fazla 10 alarm kurabilirsin");
  const { error } = await client.from("price_alerts").insert({
    user_id: userId,
    dest_code: dest,
    month: null,
    max_price: price,
    active: true,
  });
  if (error) throw error;
}
