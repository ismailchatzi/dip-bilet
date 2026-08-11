import { NextResponse } from "next/server";
import {
  emptyDealsPayload,
  readScanBoard,
} from "@/lib/scan/board";
import { mergeDealsAndFares } from "@/lib/scan/city-cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Kullanıcı API’si — SerpApi yok, sadece son cron board’u */
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

  const minDiscount = envNumber("MIN_DISCOUNT_PERCENT", 30);
  const board = await readScanBoard(supabase);
  const payload = mergeDealsAndFares(
    board.deals ?? emptyDealsPayload(),
    board.cityFares,
    minDiscount,
  );

  return NextResponse.json(payload);
}
