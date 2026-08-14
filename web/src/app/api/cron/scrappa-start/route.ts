import { NextResponse } from "next/server";
import { startScrappaWindow } from "@/lib/scan/scrappa-tick";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unauthorized() {
  return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  let window: ScrappaWindow = "near";
  try {
    const body = (await request.json()) as { window?: string };
    if (body.window === "full" || body.window === "near") window = body.window;
  } catch {
    /* near */
  }
  const result = await startScrappaWindow(window);
  return NextResponse.json(result);
}
