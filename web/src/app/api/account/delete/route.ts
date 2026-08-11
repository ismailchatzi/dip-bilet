import { NextResponse } from "next/server";
import { farewellEmailContent, sendEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Bağlantı kurulamadı." }, { status: 500 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const email = user.email;

  const { error: rpcError } = await supabase.rpc("delete_own_account");
  if (rpcError) {
    return NextResponse.json(
      { error: rpcError.message || "Hesap silinemedi." },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();

  const content = farewellEmailContent();
  const mail = await sendEmail({
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  // Silme başarılı; mail gitmese de kullanıcıya engel olmayalım
  return NextResponse.json({
    ok: true,
    emailSent: mail.ok,
    emailError: mail.ok ? undefined : mail.error,
  });
}
