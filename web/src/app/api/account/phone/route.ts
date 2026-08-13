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

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      phone: null,
      phone_verified: false,
      sms_alerts: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();
  if (admin) {
    await admin.from("phone_otps").delete().eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
