import { NextResponse } from "next/server";
import { scrappaRoundTrip } from "@/lib/providers/scrappa";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Karta tıklayınca aynı gidiş-dönüş paketinin anlık fiyatı. 1 Scrappa kredisi. */
export async function POST(req: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth yok" }, { status: 500 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  let body: {
    origin?: string;
    destination?: string;
    outboundDate?: string;
    returnDate?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "İstek bozuk" }, { status: 400 });
  }

  const origin = body.origin?.trim().toUpperCase();
  const destination = body.destination?.trim().toUpperCase();
  const outboundDate = body.outboundDate?.trim();
  const returnDate = body.returnDate?.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !origin ||
    !destination ||
    !outboundDate ||
    !returnDate ||
    !iso.test(outboundDate) ||
    !iso.test(returnDate)
  ) {
    return NextResponse.json({ error: "Eksik rota" }, { status: 400 });
  }

  try {
    const hit = await scrappaRoundTrip({
      origin,
      destination,
      departureDate: outboundDate,
      returnDate,
    });
    if (!hit) {
      return NextResponse.json({ ok: true, livePrice: null });
    }
    return NextResponse.json({
      ok: true,
      livePrice: Math.round(hit.price),
      airline: hit.airline ?? null,
      stops: hit.stops ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Kontrol edilemedi";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
