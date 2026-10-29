const MARKER = process.env.EXPO_PUBLIC_TRAVELPAYOUTS_MARKER?.trim() || "762457";

const TRIPCOM_CITY: Record<string, string> = {
  IST: "IST",
  SAW: "IST",
  FCO: "ROM",
  CIA: "ROM",
  CDG: "PAR",
  ORY: "PAR",
  TSF: "VCE",
  BGY: "MIL",
  MXP: "MIL",
  LIN: "MIL",
};

function tripcomCity(iata: string) {
  const code = iata.toUpperCase();
  return TRIPCOM_CITY[code] ?? code;
}

/** "Milano (BGY)" / "BGY" → BGY */
export function iataFromLabel(raw: string) {
  const t = raw.trim().toUpperCase();
  const m = t.match(/\b([A-Z]{3})\b/);
  return m?.[1] ?? t.slice(0, 3);
}

function kiwiSearchUrl(outOrigin: string, dest: string, outDate: string, retDate: string) {
  const params = new URLSearchParams({
    from: outOrigin.toUpperCase(),
    to: dest.toUpperCase(),
    departure: outDate,
    return: retDate,
    currency: "usd",
  });
  return `https://www.kiwi.com/deep?${params.toString()}`;
}

function aviasalesSearchUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
) {
  const [, om, od] = outDate.split("-");
  const [, rm, rd] = retDate.split("-");
  const slug = `${outOrigin.toUpperCase()}${od}${om}${dest.toUpperCase()}${rd}${rm}1`;
  const params = new URLSearchParams({
    origin_iata: outOrigin.toUpperCase(),
    destination_iata: dest.toUpperCase(),
    depart_date: outDate,
    return_date: retDate,
    adults: "1",
    children: "0",
    infants: "0",
    trip_class: "0",
    currency: "usd",
    locale: "en",
    with_request: "true",
    marker: MARKER,
  });
  return `https://www.aviasales.com/search/${slug}?${params.toString()}`;
}

/** Site deal-display ile aynı Travelpayouts Kiwi sarmalayıcı. */
export function kiwiAffiliateUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
  subId?: string,
) {
  const deep = kiwiSearchUrl(outOrigin, dest, outDate, retDate);
  const shmarker = subId ? `${MARKER}.${subId}` : MARKER;
  const params = new URLSearchParams({
    shmarker,
    promo_id: "3791",
    source_type: "customlink",
    type: "click",
    custom_url: deep,
  });
  return `https://c111.travelpayouts.com/click?${params.toString()}`;
}

/** Site deal-display ile aynı Travelpayouts Aviasales (p=4114, trs=560475). */
export function aviasalesAffiliateUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
  subId?: string,
) {
  const deep = aviasalesSearchUrl(outOrigin, dest, outDate, retDate);
  const params = new URLSearchParams({
    campaign_id: "100",
    marker: subId ? `${MARKER}.${subId}` : MARKER,
    p: "4114",
    trs: "560475",
    u: deep,
  });
  return `https://tp.media/r?${params.toString()}`;
}

/** Trip.com — site DealDetail ile aynı sabit Allianceid/SID/trip_sub3. */
export function tripcomUrl(
  outOrigin: string,
  dest: string,
  outDate: string,
  retDate: string,
) {
  const params = new URLSearchParams({
    dcity: tripcomCity(outOrigin).toLowerCase(),
    acity: tripcomCity(dest).toLowerCase(),
    ddate: outDate,
    rdate: retDate,
    triptype: "rt",
    class: "y",
    quantity: "1",
    Allianceid: "10131696",
    SID: "328743822",
    trip_sub3: "D19299933",
  });
  return `https://www.trip.com/flights/showfarefirst?${params.toString()}`;
}

/** Komisyon kaçmasın diye: yalnız bilinen affiliate kalıpları. */
export function isFlightAffiliateUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "c111.travelpayouts.com" && u.pathname === "/click") {
      return u.searchParams.get("promo_id") === "3791";
    }
    if (u.hostname === "tp.media" && u.pathname === "/r") {
      return (
        u.searchParams.get("p") === "4114" &&
        u.searchParams.get("trs") === "560475" &&
        (u.searchParams.get("marker") ?? "").startsWith(MARKER)
      );
    }
    if (u.hostname === "www.trip.com" || u.hostname === "trip.com") {
      return (
        u.searchParams.get("Allianceid") === "10131696" &&
        u.searchParams.get("SID") === "328743822"
      );
    }
    return false;
  } catch {
    return false;
  }
}

export type PartnerLink = {
  id: "aviasales" | "kiwi" | "trip";
  name: string;
  note?: string;
  url: string;
  logo: number;
};

/**
 * @param flyToAirport uçulan varış (BGY, SHJ…) — arama
 * @param citySubId şehir kodu (MXP, DXB…) — Travelpayouts subId (site ile aynı)
 */
export function partnerLinks(
  outOrigin: string,
  flyToAirport: string,
  outDate: string,
  retDate: string,
  citySubId?: string,
): PartnerLink[] {
  const dest = iataFromLabel(flyToAirport);
  const origin = iataFromLabel(outOrigin);
  const sub = citySubId ? iataFromLabel(citySubId) : dest;
  const links: PartnerLink[] = [
    {
      id: "aviasales",
      name: "Aviasales",
      note: "fırsat kartlarının %93'ünde en ucuz",
      url: aviasalesAffiliateUrl(origin, dest, outDate, retDate, sub),
      logo: require("../assets/logo-aviasales.png"),
    },
    {
      id: "kiwi",
      name: "Kiwi.com",
      url: kiwiAffiliateUrl(origin, dest, outDate, retDate, sub),
      logo: require("../assets/logo-kiwi.png"),
    },
    {
      id: "trip",
      name: "Trip.com",
      url: tripcomUrl(origin, dest, outDate, retDate),
      logo: require("../assets/logo-trip.png"),
    },
  ];
  return links.filter((l) => isFlightAffiliateUrl(l.url));
}
