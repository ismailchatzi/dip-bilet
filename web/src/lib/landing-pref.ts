/** Reklam karşılama sayfasından gelen şehir: onboarding’de seçili gelir, sonunda fırsat açılır. */
export const PREF_CITY_COOKIE = "db_pref_city";

export function landingPath(code: string) {
  return `/f/${code.toLowerCase()}`;
}

export function landingOpenPath(code: string) {
  return `${landingPath(code)}/ac`;
}

export function normalizePrefCity(raw: string | null | undefined) {
  const code = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function readPrefCity() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${PREF_CITY_COOKIE}=([^;]*)`));
  return normalizePrefCity(match ? decodeURIComponent(match[1] ?? "") : null);
}

export function writePrefCity(code: string) {
  document.cookie = `${PREF_CITY_COOKIE}=${code}; path=/; max-age=${30 * 86400}; samesite=lax`;
}
