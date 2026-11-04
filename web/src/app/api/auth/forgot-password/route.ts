import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function siteOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host.split(",")[0]!.trim()}`;
  return "https://dipbilet.com";
}

function recoveryMailContent(link: string, otp: string) {
  const subject = "Dip Bilet — şifre sıfırlama";
  const text = [
    "Merhaba,",
    "",
    "Şifreni sıfırlamak için bu linke tıkla (herhangi bir tarayıcıda açabilirsin):",
    link,
    "",
    `Ya da sitede şu 6 haneli kodu gir: ${otp}`,
    "",
    "Bu isteği sen yapmadıysan bu maili yok say.",
    "",
    "Dip Bilet",
  ].join("\n");

  const html = `
    <div style="font-family:'Segoe UI',system-ui,sans-serif;line-height:1.55;color:#00153d;max-width:520px">
      <p>Merhaba,</p>
      <p>Şifreni sıfırlamak için aşağıdaki butona tıkla. Linki <strong>istediğin tarayıcıda</strong> açabilirsin.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#00153d;color:#fff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none">Şifremi sıfırla</a>
      </p>
      <p style="font-size:14px;color:#555">Buton çalışmazsa bu linki kopyala:<br/><a href="${link}" style="color:#00153d;word-break:break-all">${link}</a></p>
      <p style="margin-top:28px;font-size:14px;color:#555">
        Alternatif: sitede şu kodu gir — <strong style="font-size:18px;letter-spacing:0.08em;color:#00153d">${otp}</strong>
      </p>
      <p style="font-size:12px;color:#888">Bu isteği sen yapmadıysan maili yok sayman yeterli.</p>
      <p style="margin-top:24px">Dip Bilet</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = String(body.email ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_missing" }, { status: 500 });
  }

  const origin = siteOrigin(request);
  const redirectTo = `${origin}/auth/callback?flow=recovery&next=/sifre-yenile`;

  // Hesap yoksa da aynı cevabı dön (enumeration yok).
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("forgot-password generateLink:", error?.message ?? "no token");
    return NextResponse.json({ ok: true });
  }

  const tokenHash = data.properties.hashed_token;
  const otp = data.properties.email_otp || "";
  const link = `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&flow=recovery&next=${encodeURIComponent("/sifre-yenile")}`;

  const content = recoveryMailContent(link, otp || "------");
  const mail = await sendEmail({
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!mail.ok) {
    console.error("forgot-password mail:", mail.error);
    return NextResponse.json({ ok: false, error: "mail_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
