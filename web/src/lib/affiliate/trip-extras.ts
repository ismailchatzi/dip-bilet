/** İstanbul kalkış — varış vitrini değil */
const ORIGIN_IATA = new Set(["IST", "SAW"]);

/**
 * Otel / araç vitrinleri: deal kaynağından bağımsız (Scrappa, Google Deals, manual).
 * Geçerli varış IATA yeterli; aktiviteler Tiqets/Klook keşfi ile otomatik gelir.
 */
export function tripExtrasSupported(iata: string) {
  const code = iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return false;
  if (ORIGIN_IATA.has(code)) return false;
  return true;
}
