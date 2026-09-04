export type ActivityOfferCard = {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  priceFormatted: string;
  oldPriceFormatted?: string;
  discountPercent?: number;
  bookUrl: string;
  livePrice: boolean;
};

export type ActivityProvider = "tiqets" | "klook";

export type ActivityOfferResult = {
  cards: ActivityOfferCard[];
  searchUrl: string;
  livePrices: boolean;
  provider: ActivityProvider;
};
