import { hardFloorUsd } from "@/lib/scan/showcase-config";
import { passesGoogleShowcaseGate } from "@/lib/scan/showcase-eligibility";

/**
 * Google Deals: hard floor VEYA Google avg × 0.75.
 * Eski Scrappa medyan kapısı kaldırıldı.
 */
export function passesGoogleDealGates(input: {
  price: number;
  average?: number;
  destCode: string;
  outDate?: string;
  scrappaM?: number | null;
}): { ok: true; badge?: string; uiThreshold?: number; strikePrice?: number } | { ok: false; reason: string } {
  void input.outDate;
  void input.scrappaM;
  const el = passesGoogleShowcaseGate({
    destCode: input.destCode,
    price: input.price,
    googleAverage: input.average,
  });
  if (!el.isEligible) return { ok: false, reason: el.reason };
  return {
    ok: true,
    badge: el.badge,
    uiThreshold: el.uiThreshold,
    strikePrice: el.strikePrice,
  };
}

/** @deprecated Tavan kaldırıldı; hard floor kullan. */
export function googleDealPriceCeilingUsd(destCode: string) {
  return hardFloorUsd(destCode) ?? (destCode === "MLE" || destCode === "HKT" || destCode === "DPS" ? 800 : 450);
}
