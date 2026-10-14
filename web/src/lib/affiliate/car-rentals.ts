import type { CarRentalResult } from "@/lib/affiliate/car-rental-types";
import { fetchQeeqCarRentalCards } from "@/lib/affiliate/qeeq";

export type {
  CarRentalCard,
  CarRentalProvider,
  CarRentalResult,
} from "@/lib/affiliate/car-rental-types";

/**
 * Yalnız QEEQ canlı liste. Liste boşsa araç vitrini gizlenir:
 * QEEQ'de aracı olmayan şehirde (AKX, AER, MLE…) arama linki boş sayfaya düşüyor.
 * EconomyBookings yedeği yok: IATA deep-link lokasyonu doldurmuyor.
 */
export async function fetchCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const qeeq = await fetchQeeqCarRentalCards(iata, cityLabel, pickupDate, dropoffDate);
      if (qeeq) return qeeq;
    } catch (err) {
      console.error("qeeq car rentals:", err);
    }
  }
  return null;
}
