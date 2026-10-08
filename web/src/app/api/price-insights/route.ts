import { NextResponse } from "next/server";
import { readPriceInsights } from "@/lib/scan/price-insights-build";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Üye: şehir fiyat özetleri (gece hesaplanır). ?dest=CDG tek şehir. */
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
  const dest = new URL(req.url).searchParams.get("dest")?.trim().toUpperCase();
  if (dest && !/^[A-Z]{3}$/.test(dest)) {
    return NextResponse.json({ error: "Geçersiz şehir" }, { status: 400 });
  }
  const insights = await readPriceInsights(admin, dest || undefined);
  return NextResponse.json(
    { insights },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
