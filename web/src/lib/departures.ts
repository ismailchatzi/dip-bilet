/** Kullanıcı kalkış tercihleri — şimdilik yalnız İstanbul aktif */

export type DepartureOption = {
  code: string;
  label: string;
  airports: string;
  available: boolean;
};

export const DEPARTURE_OPTIONS: DepartureOption[] = [
  {
    code: "IST",
    label: "İstanbul",
    airports: "IST / SAW",
    available: true,
  },
  {
    code: "ESB",
    label: "Ankara",
    airports: "ESB",
    available: false,
  },
  {
    code: "ADB",
    label: "İzmir",
    airports: "ADB",
    available: false,
  },
  {
    code: "AYT",
    label: "Antalya",
    airports: "AYT",
    available: false,
  },
];

export const DEFAULT_DEPARTURE_CODE = "IST";

export function getDepartureOption(code: string | null | undefined) {
  const found = DEPARTURE_OPTIONS.find((d) => d.code === code && d.available);
  return (
    found ??
    DEPARTURE_OPTIONS.find((d) => d.code === DEFAULT_DEPARTURE_CODE)!
  );
}

export function departureDisplay(code: string | null | undefined) {
  const d = getDepartureOption(code);
  return `${d.label} (${d.airports})`;
}
