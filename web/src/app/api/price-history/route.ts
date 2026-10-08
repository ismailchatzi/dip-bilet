import { NextResponse } from "next/server";
import type { PriceHistoryPoint } from "@/lib/price-insights";
import { turkeyTodayIso } from "@/lib/scan/trip-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const IATA = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function legByDay(
  admin: SupabaseClient,
  routeKey: string,
  date: string,
): Promise<Map<string, number>> {
  const { data } = await admin
    .from("price_observations")
    .select("price, observed_at")
    .eq("route_key", routeKey)
    .eq("outbound_date", date)
    .eq("source", "scrappa_oneway")
    .order("observed_at", { ascending: true })
    .limit(500);
  const byDay = new Map<string, number>();
  for (const r of (data ?? []) as { price: number; observed_at: string }[]) {
    const price = Number(r.price);
    if (!(price > 0)) continue;
    const day = turkeyTodayIso(new Date(r.observed_at));
    const prev = byDay.get(day);
    if (prev === undefined || price < prev) byDay.set(day, price);
  }
  return byDay;
}

/** Aynı uçuş tarihlerinin taramalarda görülen fiyatı (gidiş + dönüş tek yön toplamı). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik" }, { status: 500 });
  }

  const sp = new URL(req.url).searchParams;
  const out = sp.get("out")?.toUpperCase() ?? "";
  const dest = sp.get("dest")?.toUpperCase() ?? "";
  const back = sp.get("back")?.toUpperCase() ?? "";
  const od = sp.get("od") ?? "";
  const rd = sp.get("rd") ?? "";
  if (![out, dest, back].every((c) => IATA.test(c)) || !DAY.test(od) || !DAY.test(rd)) {
    return NextResponse.json({ error: "Geçersiz parametre" }, { status: 400 });
  }

  const [outDays, retDays] = await Promise.all([
    legByDay(admin, `${out}>${dest}`, od),
    legByDay(admin, `${dest}>${back}`, rd),
  ]);

  const days = [...new Set([...outDays.keys(), ...retDays.keys()])].sort();
  const points: PriceHistoryPoint[] = [];
  let lastOut: number | undefined;
  let lastRet: number | undefined;
  for (const day of days) {
    lastOut = outDays.get(day) ?? lastOut;
    lastRet = retDays.get(day) ?? lastRet;
    if (lastOut === undefined || lastRet === undefined) continue;
    points.push({ day, total: Math.round(lastOut + lastRet), out: lastOut, ret: lastRet });
  }

  return NextResponse.json(
    { points },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
