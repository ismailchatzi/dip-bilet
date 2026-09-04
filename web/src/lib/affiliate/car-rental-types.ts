export type CarRentalCard = {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  priceFormatted: string;
  bookUrl: string;
};

export type CarRentalProvider = "qeeq" | "economybookings";

export type CarRentalResult = {
  location: string;
  cards: CarRentalCard[];
  searchUrl: string;
  pickupDate: string;
  dropoffDate: string;
  rentalDays?: number;
  datesAdjusted: boolean;
  provider: CarRentalProvider;
  livePrices: boolean;
};
