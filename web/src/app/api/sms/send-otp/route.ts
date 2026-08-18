import { NextResponse } from "next/server";
import { normalizeTrPhone } from "@/lib/phone";
import { clientIp, hashOtpCode, hashOtpIp, otpPepper } from "@/lib/otp";
import { turkeyTodayIso } from "@/lib/scan/trip-rules";
import { sendSms } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PER_MINUTE = 1;
const PER_USER_DAY = 5;
const PER_PHONE_DAY = 5;
const PER_IP_DAY = 8;

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function turkeyDayStartIso() {
  return new Date(`${turkeyTodayIso()}T00:00:00+03:00`).toISOString();
}

async function countSince(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  column: "user_id" | "phone" | "ip_hash",
  value: string,
  since: string,
) {
  const { count } = await admin
    .from("phone_otps")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since);
  return count ?? 0;
}

export async function POST(request: Request) {
  const pepper = otpPepper();
  if (!pepper) {
    return NextResponse.json({ error: "Sunucu ayarı eksik." }, { status: 500 });
  }

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

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const dayStart = turkeyDayStartIso();
  const ip = clientIp(request);
  const ipHash = ip ? hashOtpIp(ip, pepper) : "";

  if ((await countSince(admin, "user_id", user.id, minuteAgo)) >= PER_MINUTE) {
    return NextResponse.json(
      { error: "Bir dakika sonra tekrar dene." },
      { status: 429 },
    );
  }
  if ((await countSince(admin, "user_id", user.id, dayStart)) >= PER_USER_DAY) {
    return NextResponse.json(
      { error: "Bugün için doğrulama kodu hakkın doldu." },
      { status: 429 },
    );
  }
  if ((await countSince(admin, "phone", phone, dayStart)) >= PER_PHONE_DAY) {
    return NextResponse.json(
      { error: "Bu numara için bugünkü kod hakkı doldu." },
      { status: 429 },
    );
  }
  if (ipHash) {
    const { count: ipCount, error: ipErr } = await admin
      .from("phone_otps")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", dayStart);
    if (!ipErr && (ipCount ?? 0) >= PER_IP_DAY) {
      return NextResponse.json(
        { error: "Çok fazla deneme. Yarın tekrar dene." },
        { status: 429 },
      );
    }
  }

  const code = randomOtp();
  const row: Record<string, string> = {
    user_id: user.id,
    phone,
    code_hash: hashOtpCode(code, user.id, pepper),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  if (ipHash) row.ip_hash = ipHash;

  const { error: insertError } = await admin.from("phone_otps").insert(row);
  if (insertError) {
    if (ipHash && /ip_hash/i.test(insertError.message)) {
      delete row.ip_hash;
      const retry = await admin.from("phone_otps").insert(row);
      if (retry.error) {
        console.error("phone_otps insert:", retry.error.message);
        return NextResponse.json({ error: "Kod kaydedilemedi." }, { status: 500 });
      }
    } else {
      console.error("phone_otps insert:", insertError.message);
      return NextResponse.json({ error: "Kod kaydedilemedi." }, { status: 500 });
    }
  }

  const sms = await sendSms({
    to: phone,
    text: `Dip Bilet dogrulama kodu: ${code}. 10 dk gecerli.`,
  });
  if (!sms.ok) {
    console.error("sms send-otp:", sms.error);
    return NextResponse.json(
      { error: "SMS gönderilemedi. Biraz sonra tekrar dene." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
