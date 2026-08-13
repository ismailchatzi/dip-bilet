import { NextResponse } from "next/server";
import {
  runScrappaOneWayBatch,
  type ScrappaCursor,
} from "@/lib/scan/scrappa-oneway-runner";
import type { ScrappaWindow } from "@/lib/scan/scrappa-horizon";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseWindow(raw: unknown): ScrappaWindow | null {
  if (raw === "full" || raw === "near") return raw;
  return null;
}

function parseCursor(input: {
  window?: unknown;
  destIndex?: unknown;
  dateIndex?: unknown;
}): ScrappaCursor | null {
  const window = parseWindow(input.window);
  if (!window) return null;
  const destIndex = Number(input.destIndex ?? 0);
  const dateIndex = Number(input.dateIndex ?? 0);
  if (!Number.isFinite(destIndex) || destIndex < 0) return null;
  if (!Number.isFinite(dateIndex) || dateIndex < 0) return null;
  return { window, destIndex, dateIndex };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const url = new URL(request.url);
  let cursor = parseCursor({
    window: url.searchParams.get("window"),
    destIndex: url.searchParams.get("destIndex"),
    dateIndex: url.searchParams.get("dateIndex"),
  });

  if (!cursor) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      cursor = parseCursor(body);
    } catch {
      /* yok */
    }
  }

  if (!cursor) {
    return NextResponse.json(
      { error: "window=full|near gerekli" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const batch = await runScrappaOneWayBatch(admin, cursor);

  return NextResponse.json({
    ok: batch.ok,
    done: batch.done,
    next: batch.next,
    dest: batch.dest,
    scanned: batch.scanned,
    saved: batch.saved,
    errors: batch.errors,
  });
}
