import { NextResponse } from "next/server";
import { runSerpapiDealsScan } from "@/lib/scan/serpapi-deals-runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const admin = createAdminClient();
  const result = await runSerpapiDealsScan(admin);
  return NextResponse.json(result);
}
