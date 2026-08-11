import type { DealsPayload } from "./types";

/** API key yokken veya kota koruması için örnek fırsatlar */
export function getDemoDeals(): DealsPayload {
  return {
    source: "demo",
    fetchedAt: new Date().toISOString(),
    departure: "İstanbul (IST / SAW)",
    warning:
      "Canlı tarama kapalı — SERPAPI_API_KEY eklenince gerçek Google Flights fırsatları gelecek.",
    deals: [
      {
        id: "demo-1",
        destination: "Saraybosna",
        country: "Bosna Hersek",
        price: 2180,
        averagePrice: 6200,
        discountPercent: 65,
        currency: "TRY",
        outboundDate: "2026-11-14",
        returnDate: "2026-11-16",
        airline: "Pegasus",
        stops: 0,
        googleFlightsUrl:
          "https://www.google.com/travel/flights?hl=tr&curr=TRY",
        departureLabel: "İstanbul",
      },
      {
        id: "demo-2",
        destination: "Tiflis",
        country: "Gürcistan",
        price: 2450,
        averagePrice: 5800,
        discountPercent: 58,
        currency: "TRY",
        outboundDate: "2026-10-22",
        returnDate: "2026-10-26",
        airline: "AJet",
        stops: 0,
        googleFlightsUrl:
          "https://www.google.com/travel/flights?hl=tr&curr=TRY",
        departureLabel: "İstanbul",
      },
      {
        id: "demo-3",
        destination: "Budapeşte",
        country: "Macaristan",
        price: 3120,
        averagePrice: 7100,
        discountPercent: 56,
        currency: "TRY",
        outboundDate: "2026-12-03",
        returnDate: "2026-12-08",
        airline: "Wizz Air",
        stops: 0,
        googleFlightsUrl:
          "https://www.google.com/travel/flights?hl=tr&curr=TRY",
        departureLabel: "İstanbul",
      },
      {
        id: "demo-4",
        destination: "Barselona",
        country: "İspanya",
        price: 4890,
        averagePrice: 9800,
        discountPercent: 50,
        currency: "TRY",
        outboundDate: "2026-11-05",
        returnDate: "2026-11-12",
        airline: "Turkish Airlines",
        stops: 0,
        googleFlightsUrl:
          "https://www.google.com/travel/flights?hl=tr&curr=TRY",
        departureLabel: "İstanbul",
      },
    ],
  };
}
