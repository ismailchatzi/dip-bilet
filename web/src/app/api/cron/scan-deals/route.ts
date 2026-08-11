import { NextResponse } from "next/server";
import { dealAlertEmailContent, dealKey } from "@/lib/deal-alerts";
import { sendEmail } from "@/lib/email";
import { parseCronSlot } from "@/lib/scan/routes";
import { runScanSlot } from "@/lib/scan/runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
/** Şehir batch + Deals; Netlify/Vercel limitine dikkat */
export const maxDuration = 300;

function panelUrl() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/firsatlarim`;
}

function unauthorized() {
  return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY eksik" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  let slot = parseCronSlot(url.searchParams.get("slot"));

  if (!slot) {
    try {
      const body = (await request.json()) as { slot?: string };
      slot = parseCronSlot(body.slot ?? null);
    } catch {
      /* body yok */
    }
  }

  if (!slot) {
    return NextResponse.json(
      {
        error:
          "slot gerekli: night | cities_dawn | morning | noon | sea_noon | evening | cities_evening | sea_evening",
      },
      { status: 400 },
    );
  }

  const scan = await runScanSlot(admin, slot);

  if (scan.source === "demo" && scan.cityFaresFound === 0) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      slot,
      reason: "Demo / boş — API key veya kota kontrol et",
      errors: scan.errors,
    });
  }

  const candidates = scan.dipCandidates;
  const keys = candidates.map(dealKey);

  const { data: existingRows, error: existingError } = await admin
    .from("alerted_deals")
    .select("deal_key")
    .in("deal_key", keys.length ? keys : ["__none__"]);

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message, scan },
      { status: 500 },
    );
  }

  const existing = new Set((existingRows ?? []).map((r) => r.deal_key));
  const newDeals = candidates.filter((d) => !existing.has(dealKey(d)));

  const { count: totalAlerted, error: countError } = await admin
    .from("alerted_deals")
    .select("deal_key", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const coldStart = (totalAlerted ?? 0) === 0;
  const shouldEmail = !coldStart && newDeals.length > 0;

  let emailsSent = 0;
  let emailErrors = 0;

  if (shouldEmail) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("email")
      .eq("email_alerts", true);

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }

    const recipients = (profiles ?? [])
      .map((p) => p.email?.trim())
      .filter((e): e is string => Boolean(e));

    const content = dealAlertEmailContent(newDeals, panelUrl());

    for (const to of recipients) {
      const result = await sendEmail({
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (result.ok) emailsSent += 1;
      else emailErrors += 1;
    }
  }

  const toInsert = (coldStart ? candidates : newDeals).map((d) => ({
    deal_key: dealKey(d),
    destination: d.destination,
    price: d.price,
    discount_percent: d.discountPercent ?? null,
  }));

  if (toInsert.length > 0) {
    const { error: insertError } = await admin
      .from("alerted_deals")
      .upsert(toInsert, { onConflict: "deal_key", ignoreDuplicates: true });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    slot,
    source: scan.source,
    dealsFound: scan.dealsFound,
    cityFaresFound: scan.cityFaresFound,
    dipCandidates: candidates.length,
    newDeals: newDeals.length,
    coldStart,
    emailed: shouldEmail,
    emailsSent,
    emailErrors,
    errors: scan.errors,
  });
}
