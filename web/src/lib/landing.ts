import {
  dealDestCode,
  dealWithinStopLimit,
  displayDealDiscountPercent,
  isDomesticDeal,
  isUnverifiedOneWaySum,
  vitrinHeroDeals,
} from "@/lib/deal-display";
import { destPhotoUrls } from "@/lib/destination-photos";
import { isLiveDeal } from "@/lib/scan/deal-archive";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deal } from "@/lib/types";

const OTHERS_MAX = 3;

async function readLiveDeals(): Promise<Deal[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("scan_board")
    .select("live:deals->deals")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return [];
  const raw = ((data as { live?: Deal[] | null }).live ?? []).filter(
    (d) => isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d),
  );
  return vitrinHeroDeals(raw);
}

/** Şehrin canlı vitrin kartı (hero) + vitrindeki diğer güçlü şehirler. */
export async function getLandingData(code: string) {
  const dest = code.toUpperCase();
  const live = await readLiveDeals();
  const deal = live.find((d) => dealDestCode(d) === dest) ?? null;
  const hasLocalPhoto = (d: Deal) => destPhotoUrls(dealDestCode(d)).length > 0;
  const others = live
    .filter((d) => dealDestCode(d) !== dest && !isDomesticDeal(d))
    .sort(
      (a, b) =>
        Number(hasLocalPhoto(b)) - Number(hasLocalPhoto(a)) ||
        (displayDealDiscountPercent(b) ?? 0) - (displayDealDiscountPercent(a) ?? 0),
    )
    .slice(0, OTHERS_MAX);
  return { deal, others };
}

function monthOf(iso: string | undefined, month: "long" | "short") {
  if (!iso) return null;
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const m = new Intl.DateTimeFormat("tr-TR", { month, timeZone: "UTC" }).format(new Date(t));
  return m.charAt(0).toLocaleUpperCase("tr-TR") + m.slice(1);
}

/** "Ekim" veya "Ekim–Kasım"; kesin gün üyeye kalır. */
export function tripMonths(deal: Deal) {
  const out = monthOf(deal.outboundDate, "long");
  const back = monthOf(deal.returnDate, "long");
  return out && back && out !== back ? `${out}–${back}` : out;
}

/** Gün gizli tarih aralığı: "•• Eki – •• Eki". */
export function maskedDateRange(deal: Deal) {
  const out = monthOf(deal.outboundDate, "short");
  const back = monthOf(deal.returnDate, "short");
  if (!out) return null;
  return back ? `•• ${out} – •• ${back}` : `•• ${out}`;
}
