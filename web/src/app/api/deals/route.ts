import { createClient as createSupabase } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { destCoordsForDeals } from "@/lib/airport-coords-server";
import {
  dealDestCode,
  dealWithinStopLimit,
  isUnverifiedOneWaySum,
  vitrinHeroDeals,
} from "@/lib/deal-display";
import { destPhotoUrls } from "@/lib/destination-photos";
import { emptyDealsPayload, readScanBoard } from "@/lib/scan/board";
import { isLiveDeal, sortByFoundAt } from "@/lib/scan/deal-archive";
import { createClient } from "@/lib/supabase/server";
import type { Deal } from "@/lib/types";

const SITE = "https://dipbilet.com";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  if (match?.[1]) return match[1];
  // Bazı proxy / RN istemcilerinde Authorization düşebiliyor
  return (
    request.headers.get("x-supabase-access-token") ??
    request.headers.get("x-dipbilet-token") ??
    ""
  );
}

/** Çerez (site) veya Bearer (telefon). İkisi de aynı anon anahtar. */
async function clientForRequest(request: Request) {
  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (token && url && key) {
    return createSupabase(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createClient();
}

function cardImage(deal: Deal) {
  const raw =
    destPhotoUrls(dealDestCode(deal))[0] ||
    destPhotoUrls(deal.destination)[0] ||
    deal.photoUrl ||
    "";
  if (!raw) return undefined;
  return raw.startsWith("http") ? raw : `${SITE}${raw}`;
}

export const dynamic = "force-dynamic";

/** Kayıtlı kullanıcı vitrini — eşik altı gidiş-dönüşler */
export async function GET(request: Request) {
  const token = bearerToken(request);
  const supabase = await clientForRequest(request);
  if (!supabase) {
    return NextResponse.json({ error: "Auth yok" }, { status: 500 });
  }

  const {
    data: { user },
  } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  const board = await readScanBoard(supabase);
  const payload = board.deals ?? emptyDealsPayload();
  const deals = sortByFoundAt(
    vitrinHeroDeals(
      (payload.deals ?? []).filter(
        (d) =>
          isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d),
      ),
    ),
  );

  return NextResponse.json({
    ...payload,
    deals: deals.map((deal) => ({ ...deal, cardImage: cardImage(deal) })),
    destCoords: destCoordsForDeals(deals),
    archive: undefined,
    scrappaJob: undefined,
  });
}
