export type Deal = {
  id: string;
  destination: string;
  country?: string;
  price: number;
  /** Kartta üstü çizili fiyat (medyan × 1.10) */
  averagePrice?: number;
  /** Detay: Fiyat Eşiği (medyan × 0.90) */
  thresholdPrice?: number;
  discountPercent?: number;
  currency: string;
  outboundDate?: string;
  returnDate?: string;
  airline?: string;
  stops?: number;
  googleFlightsUrl?: string;
  departureLabel: string;
  foundAt?: string;
  /** Google Deals / harici: şehir görseli */
  photoUrl?: string;
  /** Google: yolcu sorumluluğunda aktarma (ayrı bilet) */
  selfTransfer?: boolean;
};

export type ScrappaJob = {
  status: "running" | "idle";
  window: "full" | "near";
  destIndex: number;
  dateIndex: number;
  legIndex: number;
  queue: Array<"full" | "near">;
  heartbeatAt: string;
  startedAt: string;
  scanned: number;
  saved: number;
  lastError?: string;
  pausedUntil?: string;
  /** Elle askı: cron yeniden başlatmaz. */
  halted?: boolean;
};

export type DealsPayload = {
  source: "serpapi" | "cache" | "demo";
  fetchedAt: string;
  departure: string;
  deals: Deal[];
  /** Uçuş günü geçmiş kartlar; anasayfa ertesi gün gösterir. */
  archive?: Deal[];
  warning?: string;
  /** Scrappa tarama defteri — vitrine gitmez. */
  scrappaJob?: ScrappaJob;
};
