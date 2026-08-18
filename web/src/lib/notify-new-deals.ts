import { dealAlertEmailContent, dealAlertSmsContent } from "@/lib/deal-alerts";
import {
  canonicalDestCode,
  dealCityKey,
  showcaseTripDeals,
} from "@/lib/deal-display";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function relevantForUser(deals: Deal[], destCodes: string[] | null) {
  if (!destCodes || destCodes.length === 0) return [];
  const set = new Set(destCodes.map((c) => canonicalDestCode(c)));
  return deals.filter((d) => set.has(dealCityKey(d)));
}

function tripKey(deal: Deal) {
  return `${dealCityKey(deal)}|${deal.outboundDate ?? ""}|${deal.returnDate ?? ""}`;
}

/** Yeni tarih çifti, veya aynı tarihlerin daha ucuzu — diğer tarihler dahil. */
export function dealsToNotify(previous: Deal[], next: Deal[]): Deal[] {
  const prevMap = new Map(
    showcaseTripDeals(previous).map((d) => [tripKey(d), d] as const),
  );
  const alerts: Deal[] = [];
  for (const deal of showcaseTripDeals(next)) {
    const was = prevMap.get(tripKey(deal));
    if (!was || deal.price < was.price) alerts.push(deal);
  }
  return alerts;
}

export async function notifyNewDeals(
  admin: SupabaseClient,
  previous: Deal[],
  next: Deal[],
): Promise<{ emailed: number; smsed: number; skipped: string | null }> {
  if (previous.length === 0) {
    return { emailed: 0, smsed: 0, skipped: "cold-start" };
  }

  const fresh = dealsToNotify(previous, next);
  if (fresh.length === 0) {
    return { emailed: 0, smsed: 0, skipped: "no-new" };
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("email, phone, phone_verified, destination_codes");

  if (error || !profiles) {
    return { emailed: 0, smsed: 0, skipped: error?.message ?? "profiles" };
  }

  let emailed = 0;
  let smsed = 0;

  for (const p of profiles) {
    const mine = relevantForUser(fresh, p.destination_codes ?? []);
    if (mine.length === 0) continue;

    if (p.email) {
      const content = dealAlertEmailContent(mine);
      const mail = await sendEmail({
        to: p.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (mail.ok) emailed += 1;
    }

    if (p.phone_verified && p.phone) {
      const text = dealAlertSmsContent(mine);
      const sms = await sendSms({ to: p.phone, text });
      if (sms.ok) smsed += 1;
    }
  }

  return { emailed, smsed, skipped: null };
}
