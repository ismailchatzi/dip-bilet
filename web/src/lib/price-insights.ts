export type PriceInsightMonth = {
  month: string;
  min: number;
  median: number;
  samples: number;
  bestOut: string;
  bestRet: string;
};

export type PriceInsightDow = { dow: number; median: number; samples: number };

export type PriceInsight = {
  dest: string;
  currency: "USD";
  generatedAt: string;
  windowDays: number;
  samples: number;
  months: PriceInsightMonth[];
  outDow: PriceInsightDow[];
  retDow: PriceInsightDow[];
  /** Sentetik RT toplamlarının %0…%100 yüzdelikleri (101 değer). */
  quantiles: number[];
};

export type PriceHistoryPoint = {
  day: string;
  total: number;
  out: number;
  ret: number;
};

export const MIN_RANK_SAMPLES = 50;

const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const DOW_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DOW_SHORT_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export function monthLabel(month: string, short = false) {
  const m = Number(month.slice(5, 7));
  const name = MONTHS_TR[m - 1] ?? month;
  return short ? name.slice(0, 3) : name;
}

export function dowLabel(dow: number, short = false) {
  return (short ? DOW_SHORT_TR : DOW_TR)[dow] ?? "";
}

export function shortDate(iso: string) {
  const d = Number(iso.slice(8, 10));
  return `${d} ${monthLabel(iso.slice(0, 7), true)}`;
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function quantiles101(values: number[]) {
  if (values.length === 0) return [];
  const s = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i <= 100; i++) {
    const pos = ((s.length - 1) * i) / 100;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    out.push(Math.round(s[lo]! + (s[hi]! - s[lo]!) * (pos - lo)));
  }
  return out;
}

/** Görülen sentetik RT fiyatlarının yüzde kaçından ucuz (0–100). */
export function cheaperThanPercent(insight: PriceInsight | undefined, price: number) {
  if (!insight || insight.samples < MIN_RANK_SAMPLES) return null;
  const q = insight.quantiles;
  if (q.length !== 101 || !Number.isFinite(price) || price <= 0) return null;
  const above = q.filter((v) => v > price).length;
  return Math.min(99, Math.round((above / q.length) * 100));
}

const ABLATIVE_ONES = ["", "inden", "sinden", "ünden", "ünden", "inden", "sından", "sinden", "inden", "undan"];
const ABLATIVE_TENS = ["", "undan", "sinden", "undan", "ından", "sinden", "ından", "inden", "inden", "ından"];

/** "%96'sından", "%90'ından", "%80'inden" */
export function percentAblative(n: number) {
  const ones = n % 10;
  const suffix = ones ? ABLATIVE_ONES[ones] : ABLATIVE_TENS[Math.floor(n / 10) % 10];
  return `%${n}'${suffix}`;
}

/** Rozet yalnız gerçekten iyi fiyatlarda: en ucuz çeyrek. */
export function rankBadgeText(percent: number | null) {
  if (percent === null || percent < 75) return null;
  return `Fiyatların ${percentAblative(percent)} ucuz`;
}

export function cheapestMonth(insight: PriceInsight) {
  return insight.months.reduce<PriceInsightMonth | null>(
    (best, m) => (!best || m.median < best.median ? m : best),
    null,
  );
}

export function cheapestDow(rows: PriceInsightDow[]) {
  return rows.reduce<PriceInsightDow | null>(
    (best, r) => (!best || r.median < best.median ? r : best),
    null,
  );
}
