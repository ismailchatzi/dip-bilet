import { NextResponse } from "next/server";
import { dealWithinStopLimit, isUnverifiedOneWaySum } from "@/lib/deal-display";
import { emptyDealsPayload, readScanBoard } from "@/lib/scan/board";
import { isLiveDeal } from "@/lib/scan/deal-archive";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
  const deals = (payload.deals ?? []).filter(
    (d) =>
      isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d),
  );

  return NextResponse.json({
    ...payload,
    deals,
    archive: undefined,
    scrappaJob: undefined,
  });
}
