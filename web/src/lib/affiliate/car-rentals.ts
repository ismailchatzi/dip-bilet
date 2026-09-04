import type { CarRentalResult } from "@/lib/affiliate/car-rental-types";
import { fetchEconomyBookingsCarRentalCards } from "@/lib/affiliate/economybookings";
import { fetchQeeqCarRentalCards } from "@/lib/affiliate/qeeq";

export type {
  CarRentalCard,
  CarRentalProvider,
  CarRentalResult,
} from "@/lib/affiliate/car-rental-types";

/** QEEQ (canlı API) → yoksa EconomyBookings (Hertz/Sixt/Enterprise) */
export async function fetchCarRentalCards(
  iata: string,
  cityLabel: string,
  pickupDate: string,
  dropoffDate: string,
): Promise<CarRentalResult | null> {
  const qeeq = await fetchQeeqCarRentalCards(iata, cityLabel, pickupDate, dropoffDate);
  if (qeeq) return qeeq;
  return fetchEconomyBookingsCarRentalCards(iata, cityLabel, pickupDate, dropoffDate);
}
