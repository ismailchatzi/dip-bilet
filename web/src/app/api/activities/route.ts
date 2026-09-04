import {
  fetchActivityOfferCards,
  resolveActivityDestIata,
} from "@/lib/affiliate/activities";
import { tripExtrasSupported } from "@/lib/affiliate/trip-extras";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const iata = searchParams.get("iata")?.trim().toUpperCase() ?? "";
  const city =
    searchParams.get("city")?.trim() ||
    searchParams.get("cityLabel")?.trim() ||
    iata;
  const destination = searchParams.get("destination")?.trim() || city;

  if (!iata && !city) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const resolved = resolveActivityDestIata(iata || city, city, destination);
  if (!resolved || !tripExtrasSupported(resolved)) {
    return NextResponse.json({ error: "unsupported_dest" }, { status: 404 });
  }

  try {
    const result = await fetchActivityOfferCards(resolved, city, destination);
    if (!result) {
      return NextResponse.json({ error: "activities_unavailable" }, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: {
        // Şehir değişiminde CDN/edge eski yanıtı karıştırmasın
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("activities:", err);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
