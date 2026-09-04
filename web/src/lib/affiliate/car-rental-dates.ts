/** Geçmiş tarihte arama sonuç vermez — aynı gün/ay geleceğe kaydır. */
export function effectiveCarRentalDates(pickupDate: string, dropoffDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let pickup = new Date(`${pickupDate}T12:00:00`);
  let dropoff = new Date(`${dropoffDate}T12:00:00`);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(dropoff.getTime())) {
    return { pickup: pickupDate, dropoff: dropoffDate, adjusted: false };
  }

  let adjusted = false;
  while (pickup < today) {
    pickup.setFullYear(pickup.getFullYear() + 1);
    dropoff.setFullYear(dropoff.getFullYear() + 1);
    adjusted = true;
  }

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { pickup: fmt(pickup), dropoff: fmt(dropoff), adjusted };
}
