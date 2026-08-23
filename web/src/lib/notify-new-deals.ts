import { dealAlertEmailContent, dealAlertSmsContent } from "@/lib/deal-alerts";
import {
  dealCityKey,
  normalizeDestinationCode,
  showcaseTripDeals,
} from "@/lib/deal-display";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotifyEventType = "NEW_DEAL" | "PRICE_DROP";

export type NotifyEvent = {
  type: NotifyEventType;
  deal: Deal;
  tripKey: string;
  city: string;
  previousPrice?: number;
};

function tripKey(deal: Deal) {
  return `${dealCityKey(deal)}|${deal.outboundDate ?? ""}|${deal.returnDate ?? ""}`;
}

function relevantForUser(deals: Deal[], destCodes: string[] | null) {
  if (!destCodes || destCodes.length === 0) return [];
  const set = new Set(
    destCodes.map((c) => normalizeDestinationCode(c)).filter(Boolean),
  );
  return deals.filter((d) => {
    const city = normalizeDestinationCode(dealCityKey(d));
    return city !== "" && set.has(city);
  });
}

/**
 * Bildirimlik olaylar (hero + diğer tarihler):
 * - NEW_DEAL: vitrinde olmayan yeni tarih çifti
 * - PRICE_DROP: aynı tarih, daha ucuz
 * Aynı tarih + aynı fiyat yenileme → yok (REFRESH_ONLY)
 */
export function classifyNotifyEvents(
  previous: Deal[],
  next: Deal[],
): NotifyEvent[] {
  const prevMap = new Map(
    showcaseTripDeals(previous).map((d) => [tripKey(d), d] as const),
  );
  const events: NotifyEvent[] = [];

  for (const deal of showcaseTripDeals(next)) {
    const key = tripKey(deal);
    const city = dealCityKey(deal);
    const was = prevMap.get(key);

    if (!was) {
      events.push({ type: "NEW_DEAL", deal, tripKey: key, city });
      continue;
    }
    if (deal.price < was.price) {
      events.push({
        type: "PRICE_DROP",
        deal,
        tripKey: key,
        city,
        previousPrice: was.price,
      });
    }
  }

  return events;
}

/** Geriye uyum: sadece deal listesi */
export function dealsToNotify(previous: Deal[], next: Deal[]): Deal[] {
  return classifyNotifyEvents(previous, next).map((e) => e.deal);
}

function logNotifyTrace(
  previous: Deal[],
  next: Deal[],
  events: NotifyEvent[],
) {
  const prevTrips = showcaseTripDeals(previous);
  const nextTrips = showcaseTripDeals(next);
  const interesting = new Set(["VIE", "CDG", "ORY", "PAR"]);

  for (const deal of nextTrips) {
    const city = dealCityKey(deal);
    const code = normalizeDestinationCode(city);
    if (!interesting.has(code) && !interesting.has(city)) continue;

    const key = tripKey(deal);
    const was = prevTrips.find((d) => tripKey(d) === key);
    const ev = events.find((e) => e.tripKey === key);
    console.log(
      JSON.stringify({
        tag: "notify-trace",
        destination: city,
        canonical: code,
        outbound: deal.outboundDate,
        return: deal.returnDate,
        price: deal.price,
        source: deal.id.split(":")[0],
        tripKey: key,
        wasAlreadyPresent: Boolean(was),
        previousPrice: was?.price,
        isNewDate: !was,
        isPriceDrop: Boolean(was && deal.price < was.price),
        notificationEligible: Boolean(ev),
        notificationReason: ev?.type ?? "REFRESH_ONLY_OR_UNCHANGED",
      }),
    );
  }

  console.log(
    JSON.stringify({
      tag: "notify-summary",
      prevTrips: prevTrips.length,
      nextTrips: nextTrips.length,
      events: events.length,
      byType: {
        NEW_DEAL: events.filter((e) => e.type === "NEW_DEAL").length,
        PRICE_DROP: events.filter((e) => e.type === "PRICE_DROP").length,
      },
      cities: [...new Set(events.map((e) => e.city))],
    }),
  );
}

export async function notifyNewDeals(
  admin: SupabaseClient,
  previous: Deal[],
  next: Deal[],
): Promise<{ emailed: number; smsed: number; skipped: string | null }> {
  if (previous.length === 0) {
    console.log(JSON.stringify({ tag: "notify-summary", skipped: "cold-start" }));
    return { emailed: 0, smsed: 0, skipped: "cold-start" };
  }

  const events = classifyNotifyEvents(previous, next);
  logNotifyTrace(previous, next, events);

  if (events.length === 0) {
    return { emailed: 0, smsed: 0, skipped: "no-new" };
  }

  const fresh = events.map((e) => e.deal);

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "email, phone, phone_verified, destination_codes, email_alerts, sms_alerts",
    );

  if (error || !profiles) {
    return { emailed: 0, smsed: 0, skipped: error?.message ?? "profiles" };
  }

  let emailed = 0;
  let smsed = 0;

  for (const p of profiles) {
    const mine = relevantForUser(fresh, p.destination_codes ?? []);
    const destNorm = (p.destination_codes ?? []).map(normalizeDestinationCode);
    const mineCities = [...new Set(mine.map((d) => dealCityKey(d)))];

    if (mine.length === 0) {
      const hitInteresting = fresh.some((d) => {
        const c = normalizeDestinationCode(dealCityKey(d));
        return c === "VIE" || c === "CDG";
      });
      if (hitInteresting) {
        console.log(
          JSON.stringify({
            tag: "notify-user-miss",
            email: p.email,
            destination_codes: p.destination_codes,
            destination_normalized: destNorm,
            freshCities: [...new Set(fresh.map((d) => dealCityKey(d)))],
            match: false,
          }),
        );
      }
      continue;
    }

    console.log(
      JSON.stringify({
        tag: "notify-user-hit",
        email: p.email,
        destination_codes: p.destination_codes,
        destination_normalized: destNorm,
        mineCities,
        count: mine.length,
        email_alerts: p.email_alerts,
      }),
    );

    const wantEmail = p.email_alerts !== false;
    if (wantEmail && p.email) {
      const content = dealAlertEmailContent(mine);
      const mail = await sendEmail({
        to: p.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (mail.ok) emailed += 1;
      else {
        console.log(
          JSON.stringify({
            tag: "notify-email-fail",
            email: p.email,
            error: mail.error,
          }),
        );
      }
    }

    const wantSms = p.sms_alerts !== false;
    if (wantSms && p.phone_verified && p.phone) {
      const text = dealAlertSmsContent(mine);
      const sms = await sendSms({ to: p.phone, text });
      if (sms.ok) smsed += 1;
    }
  }

  return { emailed, smsed, skipped: null };
}
