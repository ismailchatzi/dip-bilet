import type { CarRentalResult } from "@/lib/affiliate/car-rental-types";
import {
  fetchQeeqCarRentalCards,
  fetchQeeqSearchFallback,
} from "@/lib/affiliate/qeeq";

export type {
  CarRentalCard,
  CarRentalProvider,
  CarRentalResult,
} from "@/lib/affiliate/car-rental-types";

/**
 * QEEQ canlı liste → olmazsa yine QEEQ arama linki.
 * EconomyBookings yedeği kaldırıldı: IATA deep-link locasyonu doldurmuyor,
 * fiyatsız “Teklif al” kartları yanıltıcıydı.
 */
export async function fetchCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  try {
    const qeeq = await fetchQeeqCarRentalCards(iata, cityLabel, pickupDate, dropoffDate);
    if (qeeq) return qeeq;
  } catch (err) {
    console.error("qeeq car rentals:", err);
  }
  return fetchQeeqSearchFallback(iata, cityLabel, pickupDate, dropoffDate);
}
