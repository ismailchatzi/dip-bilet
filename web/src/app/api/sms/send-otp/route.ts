import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { normalizeTrPhone } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function hashCode(code: string, userId: string) {
  const pepper = process.env.CRON_SECRET?.trim() || "dip-bilet-otp";
  return createHash("sha256").update(`${pepper}:${userId}:${code}`).digest("hex");
}

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
  try {
    const body = (await request.json()) as { phone?: string };
    phoneRaw = String(body.phone ?? "");
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const phone = normalizeTrPhone(phoneRaw);
  if (!phone) {
    return NextResponse.json(
      { error: "Geçerli bir telefon gir (örn. 05xx xxx xx xx)." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Sunucu ayarı eksik." }, { status: 500 });
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("phone_otps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Bir dakika sonra tekrar dene." },
      { status: 429 },
    );
  }

  const code = randomOtp();
  const { error: insertError } = await admin.from("phone_otps").insert({
    user_id: user.id,
    phone,
    code_hash: hashCode(code, user.id),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (insertError) {
    return NextResponse.json(
      { error: `Kod kaydedilemedi: ${insertError.message}` },
      { status: 500 },
    );
  }

  const sms = await sendSms({
    to: phone,
    text: `Dip Bilet dogrulama kodu: ${code}. 10 dk gecerli.`,
  });
  if (!sms.ok) {
    const raw = sms.error || "";
    const friendly = raw.includes("21408")
      ? "Twilio Türkiye’ye SMS kapalı. Geo permissions’da Turkey’i işaretle."
      : raw.includes("20003")
        ? "Twilio şifresi hatalı. Account SID / Auth Token’ı kontrol et."
        : "SMS gönderilemedi.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
