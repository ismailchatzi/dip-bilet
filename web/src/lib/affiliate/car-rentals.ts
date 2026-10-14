import type { CarRentalResult } from "@/lib/affiliate/car-rental-types";
import { fetchQeeqCarRentalCards } from "@/lib/affiliate/qeeq";
import { fetchVrooemCarRentalCards } from "@/lib/affiliate/vrooem";

export type {
  CarRentalCard,
  CarRentalProvider,
  CarRentalResult,
} from "@/lib/affiliate/car-rental-types";

/**
 * Önce QEEQ canlı liste; boşsa Vrooem canlı liste. İkisi de boşsa araç vitrini gizlenir
 * (boş sayfaya düşen arama linki yok). EconomyBookings yedeği yok: IATA deep-link lokasyonu doldurmuyor.
 * Vrooem paralel başlar ki QEEQ boş dönünce süre uzamasın.
 */
export async function fetchCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  const vrooem = fetchVrooemCarRentalCards(iata, cityLabel, pickupDate, dropoffDate).catch(
    (err) => {
      console.error("vrooem car rentals:", err);
      return null;
    },
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const qeeq = await fetchQeeqCarRentalCards(iata, cityLabel, pickupDate, dropoffDate);
      if (qeeq) return qeeq;
    } catch (err) {
      console.error("qeeq car rentals:", err);
    }
  }
  return vrooem;
}
