import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SIGNUP_COOKIE } from "@/lib/analytics";
import { PREF_CITY_COOKIE, landingOpenPath, normalizePrefCity } from "@/lib/landing-pref";
import { fetchOnboardingProfile, postAuthPath } from "@/lib/onboarding";

function siteOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return requestOrigin;
  }

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
    let nextPathResolved = nextPath;
    const pendingCookies: {
      name: string;
      value: string;
      options: Parameters<NextResponse["cookies"]["set"]>[2];
    }[] = [];

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            pendingCookies.push({ name, value, options });
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback exchange:", error.message);
      return fail();
    }

    let isNewOAuthUser = false;
    if (flow !== "confirm") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const profile = await fetchOnboardingProfile(supabase, user.id);
        nextPathResolved = postAuthPath(profile);
        const pref = normalizePrefCity(cookieStore.get(PREF_CITY_COOKIE)?.value);
        if (pref && profile?.onboarding_completed_at) {
          nextPathResolved = landingOpenPath(pref);
        }
        isNewOAuthUser = Date.now() - Date.parse(user.created_at) < 10 * 60_000;
      }
    }

    const destination =
      flow === "confirm"
        ? `${base}/giris?aktif=1`
        : `${base}${nextPathResolved}`;

    if (flow === "confirm") {
      await supabase.auth.signOut();
    }

    const response = NextResponse.redirect(destination);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    if (isNewOAuthUser) {
      response.cookies.set(SIGNUP_COOKIE, "google", {
        path: "/",
        maxAge: 600,
        sameSite: "lax",
        httpOnly: false,
      });
    }

    return response;
  } catch (err) {
    console.error("auth callback crash:", err);
    return fail();
  }
}
