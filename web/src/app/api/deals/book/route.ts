import { pickBookingUrl } from "@/lib/booking-pick";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function code(raw: string | null) {
  const v = raw?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(v) ? v : "";
}

function iso(raw: string | null) {
  const v = raw?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const origin = code(q.get("o"));
  const dest = code(q.get("d"));
  const outDate = iso(q.get("out"));
  const retDate = iso(q.get("ret"));
  const subId = q.get("sub")?.trim() || undefined;
  if (!origin || !dest || !outDate || !retDate) {
    return NextResponse.json({ error: "eksik rota" }, { status: 400 });
  }

  const url = await pickBookingUrl({ origin, dest, outDate, retDate, subId });
  if (!url) {
    return NextResponse.json({ error: "link yok" }, { status: 404 });
  }
  return NextResponse.redirect(url, 302);
}
