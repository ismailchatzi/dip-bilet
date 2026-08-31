export type DealDateOption = {
  outboundDate: string;
  returnDate: string;
  price: number;
  airline?: string;
  origin?: string;
  /** Kuyruğa eklenme zamanı — FIFO ve “eski fırsat” notu. */
  foundAt?: string;
  source?: "gdeals" | "scrappa" | "manual";
};

export type Deal = {
  id: string;
  destination: string;
  country?: string;
  price: number;
  /** Kartta üstü çizili referans */
  averagePrice?: number;
  /** Detay: Fiyat Eşiği = gerçek kapı (snapshot) */
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
  /** Canlı paket doğrulama zamanı */
  verifiedAt?: string;
  /** Son kontrol */
  lastCheckedAt?: string;
  /** MUTLAK_FIRSAT | SEZONLUK_DIP */
  dealBadge?: "MUTLAK_FIRSAT" | "SEZONLUK_DIP";
  /** Google Deals / harici: şehir görseli */
  photoUrl?: string;
  /** Google: yolcu sorumluluğunda aktarma (ayrı bilet) */
  selfTransfer?: boolean;
  /** Aynı karttaki diğer tarihler (en fazla 10; kahraman hariç) */
  dateOptions?: DealDateOption[];
};

/** Günlük kuyruk adımı (near bitince full N vb.). */
export type ScrappaQueueItem =
  | { window: "near" }
  | { window: "full"; chunk: number };

export type ScrappaJob = {
  status: "running" | "idle";
  window: "full" | "near";
  destIndex: number;
  dateIndex: number;
  legIndex: number;
  /** Bitince rematch sonrası işlenecek adımlar. */
  queue: ScrappaQueueItem[];
  heartbeatAt: string;
  startedAt: string;
  scanned: number;
  saved: number;
  lastError?: string;
  pausedUntil?: string;
  /** Art arda oturum/503 (cookie_session / request_exhausted). 200’de sıfır. */
  sessionFailStreak?: number;
  /** Elle askı: cron yeniden başlatmaz. */
  halted?: boolean;
  /** Full dilim: dahil başlangıç index. */
  destStart?: number;
  /** Full dilim: exclusive bitiş index. */
  destLimit?: number;
  /** 1..7 full chunk. */
  chunk?: number;
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
