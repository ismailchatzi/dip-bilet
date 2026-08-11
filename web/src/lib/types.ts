export type Deal = {
  id: string;
  destination: string;
  country?: string;
  price: number;
  averagePrice?: number;
  discountPercent?: number;
  currency: string;
  outboundDate?: string;
  returnDate?: string;
  airline?: string;
  stops?: number;
  googleFlightsUrl?: string;
  departureLabel: string;
};

export type DealsPayload = {
  source: "serpapi" | "cache" | "demo";
  fetchedAt: string;
  departure: string;
  deals: Deal[];
  warning?: string;
};
