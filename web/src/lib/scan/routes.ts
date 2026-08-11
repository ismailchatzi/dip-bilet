export type ScanProvider = "serpapi" | "searchapi" | "scrappa";

export type CityRoute = {
  code: string;
  name: string;
  timesPerDay: 2 | 3;
  /** Sabit sağlayıcı; SEA için slot’a göre override edilir */
  provider: ScanProvider;
};

/** Scrappa — Schengen 8 × 2/gün */
export const SCRAPPA_ROUTES: CityRoute[] = [
  { code: "ATH", name: "Atina", timesPerDay: 2, provider: "scrappa" },
  { code: "BUD", name: "Budapeşte", timesPerDay: 2, provider: "scrappa" },
  { code: "VIE", name: "Viyana", timesPerDay: 2, provider: "scrappa" },
  { code: "PRG", name: "Prag", timesPerDay: 2, provider: "scrappa" },
  { code: "FCO", name: "Roma", timesPerDay: 2, provider: "scrappa" },
  { code: "VCE", name: "Venedik", timesPerDay: 2, provider: "scrappa" },
  { code: "MUC", name: "Münih", timesPerDay: 2, provider: "scrappa" },
  { code: "BER", name: "Berlin", timesPerDay: 2, provider: "scrappa" },
];

/** SerpApi şehir — vizesiz + 3 Schengen × 2/gün */
export const SERPAPI_CITY_ROUTES: CityRoute[] = [
  { code: "TBS", name: "Tiflis", timesPerDay: 2, provider: "serpapi" },
  { code: "GYD", name: "Bakü", timesPerDay: 2, provider: "serpapi" },
  { code: "SJJ", name: "Saraybosna", timesPerDay: 2, provider: "serpapi" },
  { code: "BEG", name: "Belgrad", timesPerDay: 2, provider: "serpapi" },
  { code: "TIA", name: "Tiran", timesPerDay: 2, provider: "serpapi" },
  { code: "SKP", name: "Üsküp", timesPerDay: 2, provider: "serpapi" },
  { code: "SSH", name: "Şarm el Şeyh", timesPerDay: 2, provider: "serpapi" },
  { code: "CDG", name: "Paris", timesPerDay: 2, provider: "serpapi" },
  { code: "MAD", name: "Madrid", timesPerDay: 2, provider: "serpapi" },
  { code: "BCN", name: "Barselona", timesPerDay: 2, provider: "serpapi" },
];

/** SEA × 3/gün — SearchApi öncelik, kalan SerpApi */
export const SEA_ROUTES: CityRoute[] = [
  { code: "DPS", name: "Bali", timesPerDay: 3, provider: "searchapi" },
  { code: "HKT", name: "Phuket", timesPerDay: 3, provider: "searchapi" },
  { code: "MLE", name: "Maldivler", timesPerDay: 3, provider: "searchapi" },
];

export const DEPARTURE_IDS = "IST,SAW";
export const DEPARTURE_LABEL = "İstanbul (IST / SAW)";

/** SEA slot 0 → searchapi, slot 1–2 → serpapi (100 kota doldurma) */
export function providerForSeaSlot(slotIndex: 0 | 1 | 2): ScanProvider {
  return slotIndex === 0 ? "searchapi" : "serpapi";
}

/**
 * Cron slot’ları (Europe/Istanbul):
 * night 03:00 → Deals
 * cities_dawn 04:00 → 18 şehir
 * morning 05:00 → Deals + SEA #0 (SearchApi)
 * noon 10:00 → Deals
 * sea_noon 12:00 → SEA #1 (SerpApi)
 * evening 18:00 → Deals
 * cities_evening 19:00 → 18 şehir
 * sea_evening 20:00 → SEA #2 (SerpApi)
 */
export type CronSlot =
  | "night"
  | "cities_dawn"
  | "morning"
  | "noon"
  | "sea_noon"
  | "evening"
  | "cities_evening"
  | "sea_evening";

export function parseCronSlot(raw: string | null): CronSlot | null {
  if (
    raw === "night" ||
    raw === "cities_dawn" ||
    raw === "morning" ||
    raw === "noon" ||
    raw === "sea_noon" ||
    raw === "evening" ||
    raw === "cities_evening" ||
    raw === "sea_evening"
  ) {
    return raw;
  }
  return null;
}

export function slotRunsDeals(slot: CronSlot): boolean {
  return (
    slot === "night" ||
    slot === "morning" ||
    slot === "noon" ||
    slot === "evening"
  );
}

export function slotRunsCities2x(slot: CronSlot): boolean {
  return slot === "cities_dawn" || slot === "cities_evening";
}

/** SEA 3×/gün — 05 / 12 / 20 */
export function slotSeaIndex(slot: CronSlot): 0 | 1 | 2 | null {
  if (slot === "morning") return 0;
  if (slot === "sea_noon") return 1;
  if (slot === "sea_evening") return 2;
  return null;
}
