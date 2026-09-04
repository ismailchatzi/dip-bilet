import { bookingCityQuery } from "@/lib/affiliate/booking-hotels";

function stripIataSuffix(label: string) {
  return label.replace(/\s*\([A-Z]{3}\)\s*$/i, "").trim();
}

/** Tiqets slug eşlemesi — önce İngilizce şehir adı (Saraybosna ≠ sarajevo). */
export async function englishNamesForActivityDiscovery(
  iata: string,
  cityLabel?: string,
  destinationLabel?: string,
): Promise<string[]> {
  const code = iata.trim().toUpperCase();
  const out: string[] = [];
  const push = (value?: string | null) => {
    const t = value?.trim();
    if (!t) return;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  };

  // İngilizce kanonik ad önce — TR etiket “saraybosna” sitemap’te yok
  push(bookingCityQuery(code, cityLabel));
  push(stripIataSuffix(destinationLabel ?? ""));
  push(stripIataSuffix(cityLabel ?? ""));

  return out;
}
