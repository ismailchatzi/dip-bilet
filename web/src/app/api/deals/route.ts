import { NextResponse } from "next/server";
import { emptyDealsPayload, readScanBoard } from "@/lib/scan/board";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Kayıtlı kullanıcı vitrini — eşik altı gidiş-dönüşler */
export async function GET() {
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

  const board = await readScanBoard(supabase);
  const payload = board.deals ?? emptyDealsPayload();
  const today = todayIso();
  const deals = (payload.deals ?? []).filter(
    (d) => !d.outboundDate || d.outboundDate >= today,
  );

  return NextResponse.json({
    ...payload,
    deals,
  });
}
