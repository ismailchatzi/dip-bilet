import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";
import type { SeenDestination } from "@/lib/types";

export type DestinationOption = {
  code: string;
  name: string;
  /** Örn. BALİ-DPS */
  displayLabel: string;
};

function displayLabel(name: string, code: string) {
  return `${name.toLocaleUpperCase("tr-TR")}-${code}`;
}

/** Scrappa 21 — statik taban (katalog boşken / SSR fallback). */
export const DESTINATION_OPTIONS: DestinationOption[] =
  SCRAPPA_DESTINATIONS.map((route) => ({
    code: route.code,
    name: route.name,
    displayLabel: displayLabel(route.name, route.code),
  }));

export function optionsFromSeenDestinations(
  seen: SeenDestination[] | null | undefined,
): DestinationOption[] {
  const map = new Map<string, DestinationOption>();
  for (const d of DESTINATION_OPTIONS) map.set(d.code, d);
  for (const row of seen ?? []) {
    const code = row.code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) continue;
    const name = row.name?.trim() || code;
    map.set(code, {
      code,
      name,
      displayLabel: displayLabel(name, code),
    });
  }
  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "tr", { sensitivity: "base" }),
  );
}

export function destinationByCode(
  code: string,
  options: DestinationOption[] = DESTINATION_OPTIONS,
) {
  return options.find((d) => d.code.toUpperCase() === code.toUpperCase());
}

export function filterDestinations(
  query: string,
  options: DestinationOption[] = DESTINATION_OPTIONS,
) {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (d) =>
      d.code.toLowerCase().includes(q) ||
      d.name.toLocaleLowerCase("tr-TR").includes(q) ||
      d.displayLabel.toLocaleLowerCase("tr-TR").includes(q),
  );
}
