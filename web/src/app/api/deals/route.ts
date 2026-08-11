import { NextResponse } from "next/server";
import { getDeals } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "1";

  // Kotayı koru: refresh sadece bilerek ?refresh=1 ile
  const payload = await getDeals({ forceRefresh: force });

  return NextResponse.json(payload);
}
