import type { Deal } from "@/lib/types";
import {
  dealCityTitle,
  displayDealDiscountPercent,
  displayDealPrice,
  formatDealMoney,
} from "@/lib/deal-display";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
};

function shownMoney(deal: Deal) {
  return formatDealMoney(displayDealPrice(deal.price), deal.currency || "USD");
}

/** Kısa push metni — e-posta/SMS ile aynı fırsatlar. */
export function dealAlertPushContent(deals: Deal[]) {
  const top = deals.slice(0, 3);
  if (top.length === 0) {
    return { title: "Dip Bilet", body: "Yeni dip fırsat var." };
  }
  if (top.length === 1) {
    const d = top[0]!;
    const pct = displayDealDiscountPercent(d);
    const discount =
      typeof pct === "number" && pct > 0 ? ` · %${pct} altında` : "";
    return {
      title: `${dealCityTitle(d)} ${shownMoney(d)}`,
      body: `Yeni dip fırsat${discount}. Uygulamada bak.`,
    };
  }
  return {
    title: `${top.length} yeni dip fırsat`,
    body: top.map((d) => `${dealCityTitle(d)} ${shownMoney(d)}`).join(" · "),
  };
}

export async function sendExpoPush(
  messages: ExpoPushMessage[],
): Promise<{ ok: boolean; error?: string }> {
  if (messages.length === 0) return { ok: true };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `expo_push_${res.status}:${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "expo_push_failed",
    };
  }
}
