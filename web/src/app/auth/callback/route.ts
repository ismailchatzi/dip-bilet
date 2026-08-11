import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function siteOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${proto}://${forwardedHost.split(",")[0].trim()}`;

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const flow = searchParams.get("flow");
  const next = searchParams.get("next") ?? "/firsatlarim";
  const nextPath = next.startsWith("/") ? next : "/firsatlarim";
  const base = siteOrigin(request);

  const fail = () => NextResponse.redirect(`${base}/giris?hata=auth`);

  if (!code) return fail();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fail();

  try {
    const cookieStore = await cookies();
    const destination =
      flow === "confirm" ? `${base}/giris?aktif=1` : `${base}${nextPath}`;

    const response = NextResponse.redirect(destination);

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback exchange:", error.message);
      return fail();
    }

    if (flow === "confirm") {
      await supabase.auth.signOut();
    }

    return response;
  } catch (err) {
    console.error("auth callback crash:", err);
    return fail();
  }
}
