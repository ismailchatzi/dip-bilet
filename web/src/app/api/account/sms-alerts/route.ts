import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
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

  let enabled = false;
  try {
    const body = (await request.json()) as { enabled?: boolean };
    enabled = Boolean(body.enabled);
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, phone_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.phone_verified || !profile.phone) {
    return NextResponse.json(
      { error: "SMS için önce telefonunu doğrula." },
      { status: 403 },
    );
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      sms_alerts: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sms_alerts: enabled });
}
