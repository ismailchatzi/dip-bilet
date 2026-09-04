import { ActivitiesCarousel } from "@/components/vitrin/ActivitiesCarousel";
import { CarRentalCarousel } from "@/components/vitrin/CarRentalCarousel";
import { HotelOffersCarousel } from "@/components/vitrin/HotelOffersCarousel";

/** Otel → araç → aktivite (üstten alta). */
export function TripExtrasPanel({
  cityLabel,
  destIata,
  pickupDate,
  dropoffDate,
  destinationLabel,
}: {
  cityLabel: string;
  destIata: string;
  pickupDate: string;
  dropoffDate: string;
  /** deal.destination — aktivite IATA eşlemesi */
  destinationLabel?: string;
}) {
  if (!pickupDate || !dropoffDate) return null;

  return (
    <div className="trip-extras">
      <HotelOffersCarousel
        cityLabel={cityLabel}
        destIata={destIata}
        pickupDate={pickupDate}
        dropoffDate={dropoffDate}
      />
      <CarRentalCarousel
        cityLabel={cityLabel}
        destIata={destIata}
        pickupDate={pickupDate}
        dropoffDate={dropoffDate}
      />
      <ActivitiesCarousel
        cityLabel={cityLabel}
        destIata={destIata}
        destinationLabel={destinationLabel}
      />
    </div>
  );
}
