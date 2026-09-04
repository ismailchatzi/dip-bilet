import { resolveTripcomCityId } from "../src/lib/affiliate/tripcom-city-ids.ts";
import { fetchHotelOfferCards } from "../src/lib/affiliate/tripcom-hotels.ts";
import { fetchActivityOfferCards } from "../src/lib/affiliate/activities.ts";

async function check(
  iata: string,
  city: string,
  expectHotel: "yes" | "no" | "either",
) {
  const id = await resolveTripcomCityId(iata, city);
  const hotels = await fetchHotelOfferCards(iata, city, "2026-10-01", "2026-10-05");
  const acts = await fetchActivityOfferCards(iata, city, city);
  const hotelOk =
    expectHotel === "either" ||
    (expectHotel === "yes" && hotels && hotels.cards.length > 0) ||
    (expectHotel === "no" && !hotels);
  const titleCheck = hotels?.searchUrl.includes(`city=${id}`) || !hotels;
  console.log(
    hotelOk && titleCheck ? "OK" : "FAIL",
    iata,
    city,
    "cityId=",
    id,
    "hotels=",
    hotels?.cards.length ?? 0,
    "live=",
    hotels?.livePrices,
    "acts=",
    acts?.cards.length ?? 0,
    hotels?.searchUrl?.slice(0, 90) ?? "hidden",
  );
}

async function main() {
  // Yanlış gidenler — ya doğru şehir ya tamamen gizli
  await check("KSY", "Kars", "no");
  await check("ACC", "Akra", "yes");
  await check("BJL", "Banjul", "no");
  await check("VLC", "Valensiya", "yes");
  await check("NCE", "Nice", "yes");
  await check("BAL", "Batman", "no");
  await check("OGU", "Giresun", "yes");
  await check("BHK", "Buhara", "no");
  await check("BRU", "Brüksel", "yes");
  await check("MED", "Medine", "yes");
  await check("EIN", "Eindhoven", "no");
  await check("MXP", "Milano", "yes");
  await check("ARN", "Stokholm", "yes");
  await check("MSR", "Muş", "yes");
  await check("HKT", "Phuket", "yes");
  await check("CAI", "Kahire", "yes");
  await check("OTP", "Bükreş", "yes");
}

main().catch(console.error);
