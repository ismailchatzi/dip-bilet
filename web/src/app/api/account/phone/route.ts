import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Bağlantı kurulamadı." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Sunucu ayarı eksik." }, { status: 500 });
  }

  const { error } = await admin
    .from("profiles")
    .update({
      phone: null,
      phone_verified: false,
      sms_alerts: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) {
    console.error("account/phone delete:", error.message);
    return NextResponse.json({ error: "Telefon kaldırılamadı." }, { status: 500 });
  }

  await admin.from("phone_otps").delete().eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
