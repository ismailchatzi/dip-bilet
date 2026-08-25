import { NextResponse } from "next/server";
import {
  startScrappaDay,
  startScrappaWindow,
} from "@/lib/scan/scrappa-tick";
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
  let mode: "day" | ScrappaWindow = "day";
  let chunk: number | undefined;
  try {
    const body = (await request.json()) as {
      window?: string;
      mode?: string;
      chunk?: number;
    };
    if (body.mode === "day" || body.window === "day") mode = "day";
    else if (body.window === "full" || body.window === "near") {
      mode = body.window;
    }
    if (typeof body.chunk === "number") chunk = body.chunk;
  } catch {
    /* day */
  }
  if (mode === "day") {
    const result = await startScrappaDay({ chunk });
    return NextResponse.json(result);
  }
  const result = await startScrappaWindow(mode, { chunk });
  return NextResponse.json(result);
}
