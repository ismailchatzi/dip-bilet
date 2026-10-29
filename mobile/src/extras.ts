import { apiBase } from "./supabase";

export type ExtraCard = {
  id: string;
  title: string;
  price?: string;
  image?: string;
  url: string;
};

type ExtraKind = "hotel" | "car" | "activity";

/**
 * Otel / araç / aktivite — yalnız affiliate izli URL.
 * Trip.com Allianceid, Travelpayouts click/tp.media, Tiqets partner param.
 */
export function isExtraAffiliateUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "trip.com") {
      return (
        u.searchParams.get("Allianceid") === "10131696" &&
        !!u.searchParams.get("SID")
      );
    }
    if (host === "tp.media") {
      return u.pathname === "/r" && !!u.searchParams.get("marker");
    }
    if (host.endsWith("travelpayouts.com")) {
      return u.pathname.includes("click") && !!u.searchParams.get("shmarker");
    }
    if (host === "tiqets.com") {
      return (
        u.searchParams.get("partner") === "travelpayouts.com" &&
        !!u.searchParams.get("tq_campaign")
      );
    }
    if (host === "qeeq.com" || host === "klook.com") {
      // Bunlar ham deep link — API sarmalamadan gelmemeli; red
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

async function getJson(path: string) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

function mapCards(
  kind: ExtraKind,
  json: unknown,
): { cards: ExtraCard[]; searchUrl?: string } {
  const payload = json as {
    cards?: unknown[];
    searchUrl?: string;
  } | null;
  const raw = Array.isArray(payload?.cards) ? payload!.cards! : [];
  const searchUrl =
    typeof payload?.searchUrl === "string" &&
    isExtraAffiliateUrl(payload.searchUrl)
      ? payload.searchUrl
      : undefined;

  const cards: ExtraCard[] = raw
    .slice(0, 8)
    .map((c, i) => {
      const row = c as Record<string, unknown>;
      const url = String(
        row.bookUrl ?? row.url ?? row.href ?? searchUrl ?? "",
      );
      return {
        id: String(row.id ?? row.name ?? `${kind}-${i}`),
        title: String(row.name ?? row.title ?? kind),
        price:
          typeof row.priceFormatted === "string"
            ? row.priceFormatted
            : typeof row.priceLabel === "string"
              ? row.priceLabel
              : undefined,
        image:
          typeof row.imageUrl === "string"
            ? row.imageUrl
            : typeof row.photoUrl === "string"
              ? row.photoUrl
              : typeof row.image === "string"
                ? row.image
                : undefined,
        url,
      };
    })
    .filter((c) => c.url && isExtraAffiliateUrl(c.url));

  return { cards, searchUrl };
}

export async function fetchHotels(
  iata: string,
  city: string,
  pickup: string,
  dropoff: string,
) {
  const q = new URLSearchParams({
    iata,
    city,
    pickup,
    dropoff,
  });
  return mapCards("hotel", await getJson(`/api/hotel-offers?${q}`));
}

export async function fetchCars(
  iata: string,
  city: string,
  pickup: string,
  dropoff: string,
) {
  const q = new URLSearchParams({ iata, city, pickup, dropoff });
  return mapCards("car", await getJson(`/api/car-rentals?${q}`));
}

export async function fetchActivities(
  iata: string,
  city: string,
  destination: string,
) {
  const q = new URLSearchParams({ iata, city, destination });
  return mapCards("activity", await getJson(`/api/activities?${q}`));
}
