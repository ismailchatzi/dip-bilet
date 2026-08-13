import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { normalizeTrPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function hashCode(code: string, userId: string) {
  const pepper = process.env.CRON_SECRET?.trim() || "dip-bilet-otp";
  return createHash("sha256").update(`${pepper}:${userId}:${code}`).digest("hex");
}

export async function POST(request: Request) {
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

  let phoneRaw = "";
  let token = "";
  try {
    const body = (await request.json()) as { phone?: string; code?: string };
    phoneRaw = String(body.phone ?? "");
    token = String(body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const phone = normalizeTrPhone(phoneRaw);
  if (!phone || token.length < 4) {
    return NextResponse.json(
      { error: "Telefon ve kodu kontrol et." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Sunucu ayarı eksik." }, { status: 500 });
  }

  const { data: row } = await admin
    .from("phone_otps")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", user.id)
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Kod bulunamadı. Yeniden gönder." }, { status: 400 });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Kodun süresi doldu." }, { status: 400 });
  }
  if (row.attempts >= 5) {
    return NextResponse.json(
      { error: "Çok fazla deneme. Yeni kod iste." },
      { status: 400 },
    );
  }

  if (row.code_hash !== hashCode(token, user.id)) {
    await admin
      .from("phone_otps")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return NextResponse.json({ error: "Kod hatalı." }, { status: 400 });
  }

  await admin.from("phone_otps").delete().eq("user_id", user.id);
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      phone,
      phone_verified: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) {
    return NextResponse.json(
      { error: `Doğrulama kaydedilemedi: ${profileError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, phone });
}
