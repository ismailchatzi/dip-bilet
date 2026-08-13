import { SCRAPPA_DESTINATIONS } from "@/lib/scan/scrappa-targets";

export type DestinationOption = {
  code: string;
  name: string;
  /** Örn. BALİ-DPS */
  displayLabel: string;
};

function displayLabel(name: string, code: string) {
  return `${name.toLocaleUpperCase("tr-TR")}-${code}`;
}

export const DESTINATION_OPTIONS: DestinationOption[] =
  SCRAPPA_DESTINATIONS.map((route) => ({
    code: route.code,
    name: route.name,
    displayLabel: displayLabel(route.name, route.code),
  }));

export function destinationByCode(code: string) {
  return DESTINATION_OPTIONS.find(
    (d) => d.code.toUpperCase() === code.toUpperCase(),
  );
}

export function filterDestinations(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return DESTINATION_OPTIONS;
  return DESTINATION_OPTIONS.filter(
    (d) =>
      d.code.toLowerCase().includes(q) ||
      d.name.toLocaleLowerCase("tr-TR").includes(q) ||
      d.displayLabel.toLocaleLowerCase("tr-TR").includes(q),
  );
}
