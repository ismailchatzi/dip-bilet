export type ExternalDatePair = {
  from: string;
  to: string;
  out: string;
  ret: string | null;
};

/** Dış kaynaktan okunmuş tek ilan (henüz doğrulanmamış). */
export type ExternalDeal = {
  source: string;
  sourceId: string;
  url: string;
  title: string;
  publishedAt: string | null;
  origin: string | null;
  destCode: string | null;
  price: number | null;
  currency: string | null;
  tripType: "rt" | "ow" | null;
  stops: number | null;
  datePairs: ExternalDatePair[];
  details: Record<string, unknown>;
};

export type SourceState = {
  etag?: string;
  lastModified?: string;
  nextAt?: string;
  blockedUntil?: string;
  backoff?: number;
  /** İncelenip İstanbul kalkışlı çıkmayan ilanlar — detayına tekrar girilmez. */
  skipped?: string[];
  /** Detay sayfaları liste sayfasından ayrı engellenebiliyor (Secret Flying). */
  detail?: SourceState;
  /** Telegram: kanal başına en son okunan mesaj no. */
  lastPost?: Record<string, number>;
};

export type CollectorState = Record<string, SourceState>;
