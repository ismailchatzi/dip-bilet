import { apiBase } from "./supabase";

/** Hayal destinasyon seçimi — vitrinde görülmüş tüm şehirler (site /api/destinations). */
export type DestOption = { code: string; name: string };

/** Ağ yokken / API düşerken yedek (Scrappa + uzak hat). */
export const DREAM_DEST_CATALOG: DestOption[] = [
  { code: "AMS", name: "Amsterdam" },
  { code: "ATH", name: "Atina" },
  { code: "BCN", name: "Barselona" },
  { code: "BEG", name: "Belgrad" },
  { code: "BER", name: "Berlin" },
  { code: "BKK", name: "Bangkok" },
  { code: "BUD", name: "Budapeşte" },
  { code: "CDG", name: "Paris" },
  { code: "DPS", name: "Bali" },
  { code: "DXB", name: "Dubai" },
  { code: "FCO", name: "Roma" },
  { code: "FRA", name: "Frankfurt" },
  { code: "GYD", name: "Bakü" },
  { code: "HKT", name: "Phuket" },
  { code: "KYA", name: "Konya" },
  { code: "LTN", name: "Londra" },
  { code: "MAD", name: "Madrid" },
  { code: "MLE", name: "Maldivler" },
  { code: "MUC", name: "Münih" },
  { code: "MXP", name: "Milano" },
  { code: "PRG", name: "Prag" },
  { code: "SJJ", name: "Saraybosna" },
  { code: "SKP", name: "Üsküp" },
  { code: "SOF", name: "Sofya" },
  { code: "SSH", name: "Şarm el Şeyh" },
  { code: "TBS", name: "Tiflis" },
  { code: "TIA", name: "Tiran" },
  { code: "VCE", name: "Venedik" },
  { code: "VIE", name: "Viyana" },
  { code: "JFK", name: "New York" },
  { code: "LAX", name: "Los Angeles" },
  { code: "MIA", name: "Miami" },
  { code: "GRU", name: "São Paulo" },
  { code: "SYD", name: "Sidney" },
  { code: "HND", name: "Tokyo" },
  { code: "ICN", name: "Seul" },
  { code: "KUL", name: "Kuala Lumpur" },
  { code: "SIN", name: "Singapur" },
  { code: "HKG", name: "Hong Kong" },
].sort((a, b) => a.name.localeCompare(b.name, "tr"));

let catalogCache: DestOption[] | null = null;

export async function fetchDreamDestCatalog(): Promise<DestOption[]> {
  try {
    const res = await fetch(`${apiBase}/api/destinations`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as {
      destinations?: { code?: string; name?: string }[];
    };
    const list = (json.destinations ?? [])
      .map((d) => ({
        code: String(d.code ?? "")
          .trim()
          .toUpperCase(),
        name: String(d.name ?? "").trim(),
      }))
      .filter((d) => /^[A-Z]{3}$/.test(d.code) && d.name);
    if (list.length > 0) {
      catalogCache = list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
      return catalogCache;
    }
  } catch {
    /* yedek */
  }
  return catalogCache ?? DREAM_DEST_CATALOG;
}

export function destLabel(code: string, catalog: DestOption[] = catalogCache ?? DREAM_DEST_CATALOG) {
  const hit = catalog.find((d) => d.code === code.toUpperCase());
  return hit ? `${hit.name} (${hit.code})` : code.toUpperCase();
}
