import { NextResponse } from "next/server";
import { getLandingData } from "@/lib/landing";
import { PREF_CITY_COOKIE, normalizePrefCity } from "@/lib/landing-pref";

export const dynamic = "force-dynamic";

/** Karşılama → üyelik sonrası: şehrin canlı fırsat detayı (yoksa vitrin). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = normalizePrefCity((await params).code);
  const deal = code ? (await getLandingData(code)).deal : null;
  const path = deal ? `/firsatlarim/${encodeURIComponent(deal.id)}` : "/firsatlarim";
  const host = new URL(request.url).hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  const base =
    (!local && process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) || request.url;
  const response = NextResponse.redirect(new URL(path, base));
  response.cookies.set(PREF_CITY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
