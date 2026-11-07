import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Cihaz token’ını tüm profillerden sil — çıkış / giriş yokken bildirim kalmasın. */
export async function POST(request: Request) {
  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  if (!token.startsWith("ExponentPushToken")) {
    return NextResponse.json({ ok: true, cleared: 0 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Sunucu ayarı eksik." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("profiles")
    .update({
      expo_push_token: null,
      push_alerts: false,
      updated_at: new Date().toISOString(),
    })
    .eq("expo_push_token", token)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cleared: data?.length ?? 0 });
}
