import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dealDestCode,
  dealOutOrigin,
  foldOneCardPerCity,
  googleFlightsSearchUrl,
  isUnverifiedOneWaySum,
  MAX_DATE_OPTIONS,
} from "@/lib/deal-display";
import { destPhotoUrls } from "@/lib/destination-photos";
import { notifyNewDeals } from "@/lib/notify-new-deals";
import { readScanBoard, patchScanBoard } from "@/lib/scan/board";
import { foldShowcase } from "@/lib/scan/deal-archive";
import { hardFloorUsd, strikeFromThreshold } from "@/lib/scan/showcase-config";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import type { Deal, DealDateOption } from "@/lib/types";

export type ManualConflictAction = "attach" | "replace";

export type ManualDealInput = {
  destCode: string;
  /** Takip edilmeyen şehirlerde zorunlu (Londra, Dubai…) */
  cityName?: string;
  outboundDate: string;
  returnDate: string;
  price: number;
  /** Üstü çizili referans; yoksa hard floor veya fiyat×1.10 */
  referencePrice?: number;
  origin: "IST" | "SAW";
  returnOrigin?: "IST" | "SAW";
  airline?: string;
  googleFlightsUrl?: string;
  /** Kart görseli — yerel foto yoksa zorunlu */
  photoUrl?: string;
  dealBadge?: "MUTLAK_FIRSAT" | "SEZONLUK_DIP";
  stops?: number;
  /**
   * Şehir vitrindeyken:
   * attach = mevcut karta diğer tarih (eşik/görsel korunur) — önerilen
   * replace = kahramanı değiştir (görsel korunur)
   */
  conflictAction?: ManualConflictAction;
};

function departureLabel(outOrigin: string, retDest: string) {
  if (outOrigin === retDest) return `İstanbul (${outOrigin})`;
  return `İstanbul (${outOrigin} → ${retDest})`;
}

function resolveDest(input: ManualDealInput): { code: string; name: string } {
  const code = input.destCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error("Varış IATA 3 harf olmalı (örn. LHR, DXB)");
  }
  const tracked = findTrackedDestination(code);
  if (tracked) return { code: tracked.code, name: tracked.name };

  const name = input.cityName?.trim();
  if (!name) {
    throw new Error("Listede olmayan şehir için şehir adı gir (örn. Londra)");
  }
  return { code, name };
}

function isAutoDeal(deal: Deal) {
  return deal.id.startsWith("gdeals:") || deal.id.startsWith("scrappa:");
}

function hasLocalPhoto(code: string, cityName?: string) {
  return (
    destPhotoUrls(code).length > 0 ||
    (cityName ? destPhotoUrls(cityName).length > 0 : false)
  );
}

function tripKey(o: Pick<DealDateOption, "outboundDate" | "returnDate">) {
  return `${o.outboundDate}|${o.returnDate}`;
}

function dealAsDateOption(deal: Deal): DealDateOption | null {
  if (!deal.outboundDate || !deal.returnDate) return null;
  return {
    outboundDate: deal.outboundDate,
    returnDate: deal.returnDate,
    price: deal.price,
    airline: deal.airline,
    origin: dealOutOrigin(deal),
    foundAt: deal.foundAt,
    source: "manual",
  };
}

function attachManualAsDateOption(hero: Deal, manual: Deal): Deal {
  const incoming = dealAsDateOption(manual);
  if (!incoming) return hero;

  const headKey =
    hero.outboundDate && hero.returnDate
      ? tripKey({
          outboundDate: hero.outboundDate,
          returnDate: hero.returnDate,
        })
      : "";

  if (headKey && tripKey(incoming) === headKey) {
    // Aynı tarihler: yalnızca fiyatı ucuzsa güncelle; eşik/görsel aynı kalsın
    if (incoming.price >= hero.price) return hero;
    return {
      ...hero,
      price: incoming.price,
      airline: incoming.airline || hero.airline,
      foundAt: incoming.foundAt || hero.foundAt,
    };
  }

  const extras = [...(hero.dateOptions ?? [])];
  const idx = extras.findIndex((o) => tripKey(o) === tripKey(incoming));
  if (idx >= 0) {
    const prev = extras[idx]!;
    if (incoming.price < prev.price) extras[idx] = incoming;
  } else {
    extras.unshift(incoming);
  }

  extras.sort(
    (a, b) =>
      (b.foundAt ?? "").localeCompare(a.foundAt ?? "") || a.price - b.price,
  );

  return {
    ...hero,
    dateOptions: extras.slice(0, MAX_DATE_OPTIONS),
  };
}

export function buildManualDeal(input: ManualDealInput): Deal {
  const { code, name } = resolveDest(input);
  const origin = input.origin;
  const retDest = input.returnOrigin ?? origin;
  const now = new Date().toISOString();
  const floor = hardFloorUsd(code);
  const strikeBase =
    typeof input.referencePrice === "number" && input.referencePrice > 0
      ? input.referencePrice
      : (floor ?? input.price);
  const threshold = floor ?? Math.round(strikeBase);
  const strike = strikeFromThreshold(threshold, strikeBase);
  const discount =
    strike > 0 ? Math.round(((strike - input.price) / strike) * 100) : 0;
  const photoUrl = input.photoUrl?.trim() || undefined;

  return {
    id: `manual:${code}:${origin}:${input.outboundDate}:${retDest}:${input.returnDate}`,
    destination: `${name} (${code})`,
    price: Math.round(input.price),
    averagePrice: strike,
    thresholdPrice: threshold,
    discountPercent: discount,
    currency: "USD",
    outboundDate: input.outboundDate,
    returnDate: input.returnDate,
    airline: input.airline?.trim() || undefined,
    stops: input.stops,
    photoUrl,
    googleFlightsUrl:
      input.googleFlightsUrl?.trim() ||
      googleFlightsSearchUrl(
        origin,
        code,
        input.outboundDate,
        retDest,
        input.returnDate,
      ),
    departureLabel: departureLabel(origin, retDest),
    foundAt: now,
    verifiedAt: now,
    lastCheckedAt: now,
    dealBadge: input.dealBadge ?? "MUTLAK_FIRSAT",
  };
}

export async function addManualDealToShowcase(
  admin: SupabaseClient,
  input: ManualDealInput,
): Promise<{
  ok: boolean;
  deal?: Deal;
  error?: string;
  needsChoice?: boolean;
  existing?: Pick<
    Deal,
    | "id"
    | "destination"
    | "price"
    | "outboundDate"
    | "returnDate"
    | "thresholdPrice"
    | "averagePrice"
    | "photoUrl"
  >;
}> {
  let deal: Deal;
  try {
    deal = buildManualDeal(input);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Geçersiz kart",
    };
  }

  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const code = dealDestCode(deal);
  const rest = previous.filter((d) => dealDestCode(d) !== code);
  const sameCity = previous.filter((d) => dealDestCode(d) === code);
  const existingAuto = sameCity.find(isAutoDeal) ?? sameCity[0];

  if (existingAuto && !input.conflictAction) {
    return {
      ok: false,
      needsChoice: true,
      existing: {
        id: existingAuto.id,
        destination: existingAuto.destination,
        price: existingAuto.price,
        outboundDate: existingAuto.outboundDate,
        returnDate: existingAuto.returnDate,
        thresholdPrice: existingAuto.thresholdPrice,
        averagePrice: existingAuto.averagePrice,
        photoUrl: existingAuto.photoUrl,
      },
      error: `${existingAuto.destination} vitrinde zaten var ($${existingAuto.price}). “Diğer tarih” (önerilen) veya “Kahramanı değiştir” seç.`,
    };
  }

  // Yeni şehir / replace: görsel şart (yerel paket veya URL veya mevcut karttan miras)
  if (
    input.conflictAction !== "attach" &&
    !deal.photoUrl &&
    !hasLocalPhoto(code, input.cityName) &&
    !existingAuto?.photoUrl
  ) {
    return {
      ok: false,
      error:
        "Bu şehirde yerel görsel yok. Kart görseli URL’si zorunlu (Google/Fly4free görseli yapıştır).",
    };
  }

  let nextCity: Deal[];
  if (existingAuto && input.conflictAction === "attach") {
    nextCity = [attachManualAsDateOption(existingAuto, deal)];
  } else if (existingAuto && input.conflictAction === "replace") {
    const hero: Deal = {
      ...deal,
      photoUrl: deal.photoUrl || existingAuto.photoUrl,
      dateOptions: undefined,
    };
    // Eski kahramanı diğer tarih olarak sakla
    nextCity = foldOneCardPerCity([hero, existingAuto]);
    // fold foundAt ile manueli öne alır; görseli kaybetmesin
    nextCity = nextCity.map((d) =>
      dealDestCode(d) === code
        ? { ...d, photoUrl: d.photoUrl || existingAuto.photoUrl || deal.photoUrl }
        : d,
    );
  } else {
    nextCity = foldOneCardPerCity([
      ...sameCity.filter((d) => d.id.startsWith("manual:")),
      deal,
    ]);
  }

  const deals = [
    ...rest.filter((d) => !isUnverifiedOneWaySum(d)),
    ...nextCity,
  ];
  const { payload, live, previousLive } = foldShowcase(board.deals, deals);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, error: saved.error ?? "Kayıt başarısız" };
  await notifyNewDeals(admin, previousLive, live);
  return { ok: true, deal };
}

export async function removeManualDealFromShowcase(
  admin: SupabaseClient,
  dealId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!dealId.startsWith("manual:")) {
    return { ok: false, error: "Sadece manual: kartlar silinebilir" };
  }
  const board = await readScanBoard(admin);
  const previous = board.deals?.deals ?? [];
  const next = previous.filter((d) => d.id !== dealId);
  if (next.length === previous.length) {
    return { ok: false, error: "Kart bulunamadı" };
  }
  const { payload, live, previousLive } = foldShowcase(board.deals, next);
  const saved = await patchScanBoard(admin, { deals: payload });
  if (!saved.ok) return { ok: false, error: saved.error ?? "Silinemedi" };
  await notifyNewDeals(admin, previousLive, live);
  return { ok: true };
}
