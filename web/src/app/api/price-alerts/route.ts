import { NextResponse } from "next/server";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_ALERTS = 10;
const COLS = "id, dest_code, month, max_price, currency, last_sent_at, created_at";

async function session() {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const { data, error } = await s.supabase
    .from("price_alerts")
    .select(COLS)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: Request) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    dest?: string;
    month?: string | null;
    maxPrice?: number;
  };
  const dest = findTrackedDestination(String(body.dest ?? ""));
  if (!dest) return NextResponse.json({ error: "Bu şehir takip edilmiyor" }, { status: 400 });
  const month = body.month ? String(body.month) : null;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Geçersiz ay" }, { status: 400 });
  }
  const maxPrice = Math.round(Number(body.maxPrice));
  if (!Number.isFinite(maxPrice) || maxPrice < 20 || maxPrice > 5000) {
    return NextResponse.json({ error: "Fiyat 20–5000 $ arası olmalı" }, { status: 400 });
  }

  const { count } = await s.supabase
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if ((count ?? 0) >= MAX_ALERTS) {
    return NextResponse.json(
      { error: `En fazla ${MAX_ALERTS} alarm kurabilirsin` },
      { status: 400 },
    );
  }

  const { data, error } = await s.supabase
    .from("price_alerts")
    .insert({ user_id: s.user.id, dest_code: dest.code, month, max_price: maxPrice })
    .select(COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}

export async function DELETE(req: Request) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Geçersiz alarm" }, { status: 400 });
  }
  const { error } = await s.supabase.from("price_alerts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
