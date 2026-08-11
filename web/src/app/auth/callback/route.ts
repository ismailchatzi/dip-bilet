import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const flow = searchParams.get("flow");
  const next = searchParams.get("next") ?? "/panel";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // E-posta onayı: oturumu kapat, giriş ekranına yönlendir
        if (flow === "confirm") {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/giris?aktif=1`);
        }

        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/giris?hata=auth`);
}
