/**
 * Üye fiyat alarmları — vitrin ↔ price_alerts eşlemesi.
 * Mail mantığı eskisi gibi; push ek kanal. Mail adresi varsa
 * last_sent yalnız mail başarılıysa yazılır (eski retry davranışı).
 */
import { priceAlertEmailContent } from "@/lib/deal-alerts";
import {
  dealCityKey,
  dealWithinStopLimit,
  displayDealPrice,
  formatDealMoney,
  isUnverifiedOneWaySum,
  normalizeDestinationCode,
  showcaseTripDeals,
  vitrinHeroDeals,
} from "@/lib/deal-display";
import { sendEmail } from "@/lib/email";
import { priceAlertPushContent, sendExpoPush } from "@/lib/expo-push";
import { monthLabel } from "@/lib/price-insights";
import { readScanBoard } from "@/lib/scan/board";
import { isLiveDeal } from "@/lib/scan/deal-archive";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import { turkeyTodayIso } from "@/lib/scan/trip-rules";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const RESEND_GAP_MS = 24 * 3600_000;

type AlertRow = {
  id: number;
  user_id: string;
  dest_code: string;
  month: string | null;
  max_price: number;
  currency: string;
  last_sent_key: string | null;
  last_sent_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  push_alerts: boolean | null;
  expo_push_token: string | null;
};

function sentKey(deal: Deal) {
  return `${dealCityKey(deal)}|${deal.outboundDate}|${deal.returnDate}|${displayDealPrice(deal.price)}`;
}

function shouldSend(alert: AlertRow, key: string, price: number, now: number) {
  if (alert.last_sent_key === key) return false;
  if (!alert.last_sent_at) return true;
  const lastPrice = Number(alert.last_sent_key?.split("|").at(-1));
  if (Number.isFinite(lastPrice) && price < lastPrice) return true;
  return now - Date.parse(alert.last_sent_at) >= RESEND_GAP_MS;
}

export type PriceAlertDispatchResult = {
  alerts: number;
  matched: number;
  mailed: number;
  pushed: number;
};

/** Vitrin güncellenince veya cron ile çağrılır. */
export async function dispatchPriceAlerts(
  admin: SupabaseClient,
  opts: { send?: boolean; deals?: Deal[] } = {},
): Promise<PriceAlertDispatchResult> {
  const send = opts.send !== false;

  const { data: alertData, error } = await admin
    .from("price_alerts")
    .select(
      "id, user_id, dest_code, month, max_price, currency, last_sent_key, last_sent_at",
    )
    .eq("active", true);
  if (error) throw new Error(error.message);

  const alerts = (alertData ?? []) as AlertRow[];
  if (alerts.length === 0) {
    return { alerts: 0, matched: 0, mailed: 0, pushed: 0 };
  }

  let trips: Deal[];
  if (opts.deals) {
    trips = showcaseTripDeals(
      vitrinHeroDeals(
        opts.deals.filter(
          (d) =>
            isLiveDeal(d) &&
            dealWithinStopLimit(d) &&
            !isUnverifiedOneWaySum(d),
        ),
      ),
    );
  } else {
    const board = await readScanBoard(admin);
    trips = showcaseTripDeals(
      vitrinHeroDeals(
        (board.deals?.deals ?? []).filter(
          (d) =>
            isLiveDeal(d) &&
            dealWithinStopLimit(d) &&
            !isUnverifiedOneWaySum(d),
        ),
      ),
    );
  }

  const today = turkeyTodayIso();
  const userIds = [...new Set(alerts.map((a) => a.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, push_alerts, expo_push_token")
    .in("id", userIds);
  const profileOf = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  const now = Date.now();
  let matched = 0;
  let mailed = 0;
  let pushed = 0;

  for (const alert of alerts) {
    const max = Number(alert.max_price);
    const best = trips
      .filter(
        (d) =>
          normalizeDestinationCode(dealCityKey(d)) === alert.dest_code &&
          d.currency === alert.currency &&
          (d.outboundDate ?? "") >= today &&
          (!alert.month || (d.outboundDate ?? "").startsWith(alert.month)) &&
          displayDealPrice(d.price) <= max,
      )
      .sort((a, b) => a.price - b.price)[0];
    if (!best) continue;

    const price = displayDealPrice(best.price);
    const key = sentKey(best);
    if (!shouldSend(alert, key, price, now)) continue;
    matched += 1;

    const city =
      findTrackedDestination(alert.dest_code)?.name ?? alert.dest_code;
    const when = alert.month
      ? `${monthLabel(alert.month)} ${alert.month.slice(0, 4)}`
      : "herhangi bir ay";
    const alertText = `${city} · ${when} · ${formatDealMoney(max, alert.currency)} altı`;
    const profile = profileOf.get(alert.user_id);
    const to = profile?.email?.trim() || "";
    const pushToken =
      typeof profile?.expo_push_token === "string"
        ? profile.expo_push_token.trim()
        : "";
    const wantPush =
      Boolean(profile?.push_alerts) &&
      pushToken.startsWith("ExponentPushToken");

    console.log(
      JSON.stringify({
        tag: "price-alert",
        mode: send ? "send" : "dry",
        alertId: alert.id,
        alertText,
        outbound: best.outboundDate,
        return: best.returnDate,
        price,
        mail: Boolean(to),
        push: wantPush,
      }),
    );

    if (!send) continue;
    if (!to && !wantPush) continue;

    let mailOk = false;
    let pushOk = false;
    if (to) {
      const content = priceAlertEmailContent(best, alertText);
      const mail = await sendEmail({
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (mail.ok) {
        mailed += 1;
        mailOk = true;
      } else {
        console.log(
          JSON.stringify({
            tag: "price-alert-mail-fail",
            alertId: alert.id,
            error: mail.error,
          }),
        );
      }
    }

    if (wantPush) {
      const pushContent = priceAlertPushContent(best, alertText);
      const push = await sendExpoPush([
        {
          to: pushToken,
          title: pushContent.title,
          body: pushContent.body,
          data: pushContent.data,
          sound: "default",
        },
      ]);
      if (push.ok) {
        pushed += 1;
        pushOk = true;
      } else {
        console.log(
          JSON.stringify({
            tag: "price-alert-push-fail",
            alertId: alert.id,
            error: push.error,
          }),
        );
      }
    }

    // Mail’i bozma: adresi varsa yalnız mail OK iken işaretle (eski davranış).
    // Mail yoksa push yeterli.
    const mark = to ? mailOk : pushOk;
    if (!mark) continue;

    await admin
      .from("price_alerts")
      .update({
        last_sent_key: key,
        last_sent_at: new Date(now).toISOString(),
      })
      .eq("id", alert.id);
  }

  return { alerts: alerts.length, matched, mailed, pushed };
}
