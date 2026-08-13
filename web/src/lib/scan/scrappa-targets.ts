/**
 * Scrappa tek-yön tarama hedefleri.
 *
 * - Kalkış: IST + SAW (tek istekte ikisi olmaz → 2 ayrı istek)
 * - Varış: şehir başına 1 havalimanı (varsa en işlek olan)
 * - Yön: gidiş + dönüş ayrı one-way
 */

export const SCRAPPA_ORIGINS = ["IST", "SAW"] as const;

export type ScrappaDestination = {
  code: string;
  name: string;
  /** Varsa kullanılmayan 2. havalimanı */
  skippedAlt?: string;
};

/** 21 varış — çift havalimanlı şehirlerde en çok kullanılan */
export const SCRAPPA_DESTINATIONS: ScrappaDestination[] = [
  { code: "ATH", name: "Atina" },
  { code: "BUD", name: "Budapeşte" },
  { code: "VIE", name: "Viyana" },
  { code: "PRG", name: "Prag" },
  { code: "FCO", name: "Roma", skippedAlt: "CIA" },
  { code: "VCE", name: "Venedik", skippedAlt: "TSF" },
  { code: "MUC", name: "Münih" },
  { code: "BER", name: "Berlin" },
  { code: "TBS", name: "Tiflis" },
  { code: "GYD", name: "Bakü" },
  { code: "SJJ", name: "Saraybosna" },
  { code: "BEG", name: "Belgrad" },
  { code: "TIA", name: "Tiran" },
  { code: "SKP", name: "Üsküp" },
  { code: "SSH", name: "Şarm el Şeyh" },
  { code: "CDG", name: "Paris", skippedAlt: "ORY" },
  { code: "MAD", name: "Madrid" },
  { code: "BCN", name: "Barselona" },
  { code: "DPS", name: "Bali" },
  { code: "HKT", name: "Phuket" },
  { code: "MLE", name: "Maldivler" },
];

/** 1 varış × 1 tarih = 4 one-way istek */
export function scrappaLegsForDate(
  destCode: string,
  date: string,
): Array<{ origin: string; destination: string; date: string }> {
  return [
    { origin: "IST", destination: destCode, date },
    { origin: "SAW", destination: destCode, date },
    { origin: destCode, destination: "IST", date },
    { origin: destCode, destination: "SAW", date },
  ];
}

/** 6 ay ≈ 183 gün; ayda 4 ucuz gün × 6 = 24 */
export const HORIZON_DAYS = 183;
export const CHEAP_DAYS_PER_MONTH = 4;
export const CHEAP_DAYS_IN_HORIZON = 6 * CHEAP_DAYS_PER_MONTH;
export const REST_DAYS_IN_HORIZON = HORIZON_DAYS - CHEAP_DAYS_IN_HORIZON;

/** Ucuz gün 3×, kalan 1× → 24×3 + 159×1 = 231 gün-eşdeğeri */
export const DAY_EQUIVALENTS =
  CHEAP_DAYS_IN_HORIZON * 3 + REST_DAYS_IN_HORIZON * 1;

const DEST_COUNT = SCRAPPA_DESTINATIONS.length;
const ORIGIN_COUNT = SCRAPPA_ORIGINS.length;

/** 1 varış × 1 tarih = 4 one-way istek */
export const CREDITS_PER_SCAN = DEST_COUNT * ORIGIN_COUNT * 2;

/** Hibrit / gün: gidiş+dönüş ≈ 19.400 */
export const CREDITS_PER_DAY_HYBRID_RT =
  DAY_EQUIVALENTS * DEST_COUNT * ORIGIN_COUNT * 2;

/** Hibrit / gün: sadece gidiş ≈ 9.700 */
export const CREDITS_PER_DAY_HYBRID_OUT =
  DAY_EQUIVALENTS * DEST_COUNT * ORIGIN_COUNT;

export const CREDITS_PER_MONTH_HYBRID_RT = CREDITS_PER_DAY_HYBRID_RT * 30;
export const CREDITS_PER_MONTH_HYBRID_OUT = CREDITS_PER_DAY_HYBRID_OUT * 30;
