import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/admin/auth";
import {
  addManualDealToShowcase,
  removeManualDealFromShowcase,
  type ManualDealInput,
} from "@/lib/admin/manual-deal";
import { dealDestCode } from "@/lib/deal-display";
import { readScanBoard } from "@/lib/scan/board";
import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
}

function iso(raw: unknown) {
  const v = typeof raw === "string" ? raw.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function origin(raw: unknown): "IST" | "SAW" | "" {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return v === "IST" || v === "SAW" ? v : "";
}

function badge(raw: unknown): ManualDealInput["dealBadge"] | undefined {
  if (raw === "MUTLAK_FIRSAT" || raw === "SEZONLUK_DIP") return raw;
  return undefined;
}

function parseBody(body: Record<string, unknown>): ManualDealInput | string {
  const destCode =
    typeof body.destCode === "string" ? body.destCode.trim().toUpperCase() : "";
  const cityName =
    typeof body.cityName === "string" ? body.cityName.trim() : undefined;
  const outboundDate = iso(body.outboundDate);
  const returnDate = iso(body.returnDate);
  const price = Number(body.price);
  const refRaw = body.referencePrice;
  const referencePrice =
    refRaw === "" || refRaw == null
      ? undefined
      : Number.isFinite(Number(refRaw)) && Number(refRaw) > 0
        ? Number(refRaw)
        : undefined;
  const outOrigin = origin(body.origin);
  const returnOriginRaw = origin(body.returnOrigin);
  const returnOrigin = returnOriginRaw || undefined;

  if (!destCode) return "Varış IATA gir (örn. ATH, LHR)";
  if (!/^[A-Z]{3}$/.test(destCode)) return "Varış IATA 3 harf olmalı";
  if (!outboundDate || !returnDate) return "Tarihler YYYY-MM-DD olmalı";
  if (!Number.isFinite(price) || price <= 0) return "Geçerli fiyat gir";
  if (!outOrigin) return "Kalkış IST veya SAW olmalı";
  if (returnDate < outboundDate) return "Dönüş gidişten önce olamaz";

  const stopsRaw = body.stops;
  const stops =
    stopsRaw === "" || stopsRaw == null
      ? undefined
      : Number.isFinite(Number(stopsRaw))
        ? Number(stopsRaw)
        : undefined;

  return {
    destCode,
    cityName,
    outboundDate,
    returnDate,
    price,
    referencePrice,
    origin: outOrigin,
    returnOrigin,
    airline:
      typeof body.airline === "string" ? body.airline.trim() : undefined,
    googleFlightsUrl:
      typeof body.googleFlightsUrl === "string"
        ? body.googleFlightsUrl.trim()
        : undefined,
    dealBadge: badge(body.dealBadge),
    stops,
    photoUrl:
      typeof body.photoUrl === "string" ? body.photoUrl.trim() : undefined,
    conflictAction:
      body.conflictAction === "attach" || body.conflictAction === "replace"
        ? body.conflictAction
        : undefined,
  };
}

export async function GET() {
  if (!(await isAdminAuthed())) return unauthorized();

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Veritabanı yok" }, { status: 503 });
  }

  const board = await readScanBoard(admin);
  const manual = (board.deals?.deals ?? []).filter((d) =>
    d.id.startsWith("manual:"),
  );

  return NextResponse.json({
    destinations: SCRAPPA_DESTINATIONS.map((d) => ({
      code: d.code,
      name: d.name,
    })),
    manual,
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthed())) return unauthorized();

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Veritabanı yok" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const result = await addManualDealToShowcase(admin, parsed);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "Kayıt başarısız",
        needsChoice: result.needsChoice === true,
        existing: result.existing,
      },
      { status: result.needsChoice ? 409 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    deal: result.deal,
    dest: dealDestCode(result.deal!),
  });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthed())) return unauthorized();

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Veritabanı yok" }, { status: 503 });
  }

  let dealId = "";
  try {
    const body = (await request.json()) as { id?: string };
    dealId = body.id?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }
  if (!dealId) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  const result = await removeManualDealFromShowcase(admin, dealId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Silinemedi" }, {
      status: 400,
    });
  }
  return NextResponse.json({ ok: true });
}
