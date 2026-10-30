/**
 * Üye fiyat alarmları — vitrindeki canlı fırsatları alarmlarla eşler, tutanlara e-posta.
 * Tarama defterine dokunmaz; yalnız scan_board okur, price_alerts günceller.
 *
 * npx tsx scripts/send-price-alerts.ts          → kuru çalışma (kim eşleşir)
 * npx tsx scripts/send-price-alerts.ts --send   → e-posta + push (açıksa) + alarmı işaretle
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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
import { createAdminClient } from "@/lib/supabase/admin";
import type { Deal } from "@/lib/types";

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

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

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

async function main() {
  loadEnv();
  const send = process.argv.includes("--send");
  const admin = createAdminClient();
  if (!admin) {
    console.error("Supabase yok");
    process.exit(1);
  }

  const { data: alertData, error } = await admin
    .from("price_alerts")
    .select("id, user_id, dest_code, month, max_price, currency, last_sent_key, last_sent_at")
    .eq("active", true);
  if (error) {
    console.error("price_alerts:", error.message);
    process.exit(1);
  }
  const alerts = (alertData ?? []) as AlertRow[];
  if (alerts.length === 0) {
    console.log("alarm yok");
    return;
  }

  const board = await readScanBoard(admin);
  const live = vitrinHeroDeals(
    (board.deals?.deals ?? []).filter(
      (d) => isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d),
    ),
  );
  const trips = showcaseTripDeals(live);
  const today = turkeyTodayIso();

  const userIds = [...new Set(alerts.map((a) => a.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, push_alerts, expo_push_token")
    .in("id", userIds);
  type ProfileRow = {
    id: string;
    email: string | null;
    push_alerts: boolean | null;
    expo_push_token: string | null;
  };
  const profileOf = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  const now = Date.now();
  let matched = 0;
  let sent = 0;
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

    const city = findTrackedDestination(alert.dest_code)?.name ?? alert.dest_code;
    const when = alert.month ? `${monthLabel(alert.month)} ${alert.month.slice(0, 4)}` : "herhangi bir ay";
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
      `${send ? "GÖNDER" : "KURU"} alarm#${alert.id} ${alertText} → ${best.outboundDate}/${best.returnDate} ${formatDealMoney(price, best.currency)} mail:${to ? "evet" : "yok"} push:${wantPush ? "evet" : "yok"}`,
    );
    if (!send) continue;
    if (!to && !wantPush) continue;

    let delivered = false;
    if (to) {
      const content = priceAlertEmailContent(best, alertText);
      const mail = await sendEmail({
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (mail.ok) {
        sent += 1;
        delivered = true;
      } else {
        console.log(`  mail hatası: ${mail.error}`);
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
        delivered = true;
      } else {
        console.log(`  push hatası: ${push.error}`);
      }
    }
    if (!delivered) continue;
    await admin
      .from("price_alerts")
      .update({ last_sent_key: key, last_sent_at: new Date(now).toISOString() })
      .eq("id", alert.id);
  }
  console.log(
    `alarm: ${alerts.length} · eşleşen: ${matched} · mail: ${sent} · push: ${pushed}${send ? "" : " (kuru çalışma)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
