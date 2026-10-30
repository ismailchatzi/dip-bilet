import type { Deal } from "@/lib/types";
import {
  dealCityKey,
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

function dealPushData(deal: Deal): Record<string, string> {
  const code = dealCityKey(deal).trim().toUpperCase();
  return {
    screen: "deal",
    dealId: deal.id,
    ...(code ? { destCode: code } : {}),
  };
}

/** Hayal destinasyon / yeni fırsat push. */
export function dealAlertPushContent(deals: Deal[]): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  const top = deals.slice(0, 3);
  if (top.length === 0) {
    return {
      title: "Dip Bilet Fırsat",
      body: "Takip ettiğin destinasyonlarda yeni fırsat olabilir. Hemen incele!",
      data: { screen: "vitrin" },
    };
  }
  if (top.length === 1) {
    const d = top[0]!;
    const pct = displayDealDiscountPercent(d);
    const discount =
      typeof pct === "number" && pct > 0
        ? ` Normal fiyattan %${pct} daha ucuz.`
        : "";
    return {
      title: "Dip Bilet Fırsat",
      body: `${dealCityTitle(d)} ${shownMoney(d)}.${discount} Takip ettiğin destinasyonda fırsatı yakalamak için hemen incele!`,
      data: dealPushData(d),
    };
  }
  return {
    title: "Dip Bilet Fırsat",
    body: `${top.length} yeni fırsat: ${top
      .map((d) => `${dealCityTitle(d)} ${shownMoney(d)}`)
      .join(" · ")}. Hemen incele!`,
    data: { screen: "vitrin" },
  };
}

/** Üye fiyat alarmı tuttu — tek fırsat. */
export function priceAlertPushContent(
  deal: Deal,
  alertText: string,
): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  return {
    title: "Dip Bilet Fırsat",
    body: `${dealCityTitle(deal)} ${shownMoney(deal)}. Alarmın tuttu (${alertText}). Hemen incele!`,
    data: dealPushData(deal),
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
