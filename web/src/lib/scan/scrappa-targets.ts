/**
 * Scrappa tek-yön tarama hedefleri.
 *
 * - Kalkış: IST + SAW (tek istekte ikisi olmaz → 2 ayrı istek)
 * - Varış: şehir başına ana havalimanı + varsa ekstra havalimanları (ayrı istek)
 * - Yön: gidiş + dönüş ayrı one-way
 * - Liste sırası = full dilimler (7 × 4). Ekstra havalimanlı şehirler (Paris,
 *   Milano+Londra, Dubai) haftalık çiftlerde yan yana gelmeyen dilimlerde.
 */

export const SCRAPPA_ORIGINS = ["IST", "SAW"] as const;

export type ScrappaOrigin = (typeof SCRAPPA_ORIGINS)[number];

export type ScrappaExtraAirport = {
  code: string;
  /** Yalnız bu İstanbul havalimanlarıyla taranır (gidiş + dönüş). */
  origins?: readonly ScrappaOrigin[];
  /** Ayrı şehir sayılabilecek havalimanı — kartta "Dubai – Şarja". */
  label?: string;
};

export type ScrappaDestination = {
  code: string;
  name: string;
  /** Aynı şehirde ayrıca taranan havalimanları; fiyatlar bu şehrin kartına yazılır. */
  extraAirports?: readonly ScrappaExtraAirport[];
  /** Taranmayan diğer havalimanı (Google Deals eşlemesi için). */
  skippedAlt?: string;
};

/** 28 varış — full dilim sırası (her dilim 4 şehir) */
export const SCRAPPA_DESTINATIONS: ScrappaDestination[] = [
  // Dilim 1
  { code: "CDG", name: "Paris", extraAirports: [{ code: "ORY" }] },
  { code: "BUD", name: "Budapeşte" },
  { code: "VIE", name: "Viyana" },
  { code: "SOF", name: "Sofya" },
  // Dilim 2
  { code: "PRG", name: "Prag" },
  { code: "FCO", name: "Roma", skippedAlt: "CIA" },
  { code: "VCE", name: "Venedik", skippedAlt: "TSF" },
  { code: "MUC", name: "Münih" },
  // Dilim 3
  {
    code: "MXP",
    name: "Milano",
    extraAirports: [{ code: "BGY", origins: ["SAW"] }],
    skippedAlt: "LIN",
  },
  { code: "BER", name: "Berlin" },
  { code: "TBS", name: "Tiflis" },
  {
    code: "LTN",
    name: "Londra",
    extraAirports: [{ code: "STN", origins: ["SAW"] }],
  },
  // Dilim 4
  { code: "GYD", name: "Bakü" },
  { code: "SJJ", name: "Saraybosna" },
  { code: "BEG", name: "Belgrad" },
  { code: "AMS", name: "Amsterdam" },
  // Dilim 5
  { code: "TIA", name: "Tiran" },
  { code: "SKP", name: "Üsküp" },
  { code: "SSH", name: "Şarm el Şeyh" },
  {
    code: "DXB",
    name: "Dubai",
    extraAirports: [{ code: "SHJ", label: "Şarja" }],
  },
  // Dilim 6
  { code: "ATH", name: "Atina" },
  { code: "MAD", name: "Madrid" },
  { code: "BCN", name: "Barselona" },
  { code: "FRA", name: "Frankfurt" },
  // Dilim 7
  { code: "DPS", name: "Bali" },
  { code: "HKT", name: "Phuket" },
  { code: "MLE", name: "Maldivler" },
  { code: "BKK", name: "Bangkok" },
];

/** Yeni şehir listeye eklenince Deals taraması da onu görür */
export function findTrackedDestination(
  airportCode: string,
): ScrappaDestination | null {
  const code = airportCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return (
    SCRAPPA_DESTINATIONS.find(
      (d) =>
        d.code === code ||
        d.skippedAlt === code ||
        d.extraAirports?.some((a) => a.code === code),
    ) ?? null
  );
}

/** Şehrin taranan havalimanları: ana + ekstra. */
export function cityAirportCodes(dest: ScrappaDestination): string[] {
  return [dest.code, ...(dest.extraAirports ?? []).map((a) => a.code)];
}

/** Kart başlığı: "Milano (BGY)", "Dubai – Şarja (SHJ)". */
export function trackedDestinationLabel(
  dest: ScrappaDestination,
  airport = dest.code,
): string {
  const code = airport.trim().toUpperCase();
  const label = dest.extraAirports?.find((a) => a.code === code)?.label;
  return `${label ? `${dest.name} – ${label}` : dest.name} (${code})`;
}

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
const LEGS_PER_DATE = ORIGIN_COUNT * 2;

/** Tek full tarama (tüm ufuk, tüm şehir) — referans kota */
export const FULL_SCAN_REQUESTS =
  DEST_COUNT * DAY_EQUIVALENTS * LEGS_PER_DATE;
