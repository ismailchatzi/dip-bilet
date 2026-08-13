/** Kullanıcı kalkış tercihleri — şimdilik yalnız İstanbul aktif */

export type DepartureOption = {
  code: string;
  label: string;
  airports: string;
  available: boolean;
};

/** Arama kutusunda gösterilen kalkış seçenekleri */
export type DepartureSearchOption = {
  code: string;
  label: string;
  detail: string;
  available: boolean;
  keywords: string[];
};

export const DEPARTURE_SEARCH_OPTIONS: DepartureSearchOption[] = [
  {
    code: "IST",
    label: "İstanbul",
    detail: "Tüm havalimanları · IST / SAW",
    available: true,
    keywords: ["istanbul", "ist", "saw", "tüm", "havaliman", "havalimani"],
  },
  {
    code: "IST_ONLY",
    label: "İstanbul Havalimanı",
    detail: "IST",
    available: true,
    keywords: ["istanbul", "ist", "havaliman", "havalimani", "avrupa"],
  },
  {
    code: "SAW_ONLY",
    label: "İstanbul Sabiha Gökçen",
    detail: "SAW",
    available: true,
    keywords: ["istanbul", "sabiha", "saw", "gökçen", "gokcen", "anadolu"],
  },
  {
    code: "ESB",
    label: "Ankara",
    detail: "ESB · Yakında",
    available: false,
    keywords: ["ankara", "esb"],
  },
  {
    code: "ADB",
    label: "İzmir",
    detail: "ADB · Yakında",
    available: false,
    keywords: ["izmir", "adb"],
  },
  {
    code: "AYT",
    label: "Antalya",
    detail: "AYT · Yakında",
    available: false,
    keywords: ["antalya", "ayt"],
  },
];

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
  const search = DEPARTURE_SEARCH_OPTIONS.find(
    (d) => d.code === code && d.available,
  );
  if (search) {
    return {
      code: search.code,
      label: search.label,
      airports: search.detail.replace(" · Yakında", ""),
      available: true,
    };
  }

  const found = DEPARTURE_OPTIONS.find((d) => d.code === code && d.available);
  return (
    found ??
    DEPARTURE_OPTIONS.find((d) => d.code === DEFAULT_DEPARTURE_CODE)!
  );
}

export function filterDepartureSearch(query: string) {
  const q = query.trim().toLocaleLowerCase("tr-TR");
  if (!q) {
    return DEPARTURE_SEARCH_OPTIONS.filter((o) => o.available);
  }
  return DEPARTURE_SEARCH_OPTIONS.filter(
    (o) =>
      o.available &&
      (o.label.toLocaleLowerCase("tr-TR").includes(q) ||
        o.detail.toLocaleLowerCase("tr-TR").includes(q) ||
        o.code.toLocaleLowerCase("tr-TR").includes(q) ||
        o.keywords.some((k) => k.includes(q) || q.includes(k))),
  );
}

export type DepartureAirport = {
  code: string;
  label: string;
};

/** Uçuş ayarlarındaki kalkış tercihine göre filtrelenebilir havalimanları */
export function airportsFromDepartureCode(
  code: string | null | undefined,
): DepartureAirport[] {
  const d = getDepartureOption(code);
  if (d.code === "IST_ONLY") {
    return [{ code: "IST", label: "İstanbul Havalimanı" }];
  }
  if (d.code === "SAW_ONLY") {
    return [{ code: "SAW", label: "Sabiha Gökçen" }];
  }
  return [
    { code: "IST", label: "İstanbul Havalimanı" },
    { code: "SAW", label: "Sabiha Gökçen" },
  ];
}

export function departureDisplay(code: string | null | undefined) {
  const d = getDepartureOption(code);
  return `${d.label} (${d.airports})`;
}

/** Vitrin başlığı için şehir adı (örn. İSTANBUL) */
export function departureCityHeadline(code: string | null | undefined) {
  const d = getDepartureOption(code);
  const isIstanbul =
    d.code === "IST" ||
    d.code === "IST_ONLY" ||
    d.code === "SAW_ONLY" ||
    d.label.toLocaleLowerCase("tr-TR").includes("istanbul");
  const city = isIstanbul ? "İstanbul" : d.label;
  return city.toLocaleUpperCase("tr-TR");
}
