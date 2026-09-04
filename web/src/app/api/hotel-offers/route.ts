import { fetchHotelOfferCards } from "@/lib/affiliate/tripcom-hotels";
import { tripExtrasSupported } from "@/lib/affiliate/trip-extras";
import { NextResponse } from "next/server";

function parseIsoDate(s: string | null) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const iata = searchParams.get("iata")?.trim().toUpperCase() ?? "";
  const city =
    searchParams.get("city")?.trim() ||
    searchParams.get("cityLabel")?.trim() ||
    iata;
  const pickup = parseIsoDate(searchParams.get("pickup"));
  const dropoff = parseIsoDate(searchParams.get("dropoff"));

  if (!iata || !pickup || !dropoff) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }
  if (!tripExtrasSupported(iata)) {
    return NextResponse.json({ error: "unsupported_dest" }, { status: 404 });
  }
  if (dropoff <= pickup) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }

  try {
    const result = await fetchHotelOfferCards(iata, city, pickup, dropoff);
    if (!result || result.cards.length === 0) {
      return NextResponse.json({ error: "no_offers" }, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch (err) {
    console.error("hotel-offers:", err);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
