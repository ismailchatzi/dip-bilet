import { dealAlertEmailContent, dealAlertSmsContent } from "@/lib/deal-alerts";
import { dealDestCode } from "@/lib/deal-display";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import type { Deal } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function panelUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://dipbilet.com";
  return `${raw.replace(/\/$/, "")}/firsatlarim`;
}

function relevantForUser(deals: Deal[], destCodes: string[] | null) {
  if (!destCodes || destCodes.length === 0) return [];
  const set = new Set(destCodes.map((c) => c.toUpperCase()));
  return deals.filter((d) => set.has(dealDestCode(d).toUpperCase()));
}

export async function notifyNewDeals(
  admin: SupabaseClient,
  previous: Deal[],
  next: Deal[],
): Promise<{ emailed: number; smsed: number; skipped: string | null }> {
  if (previous.length === 0) {
    return { emailed: 0, smsed: 0, skipped: "cold-start" };
  }

  const prevIds = new Set(previous.map((d) => d.id));
  const fresh = next.filter((d) => !prevIds.has(d.id));
  if (fresh.length === 0) {
    return { emailed: 0, smsed: 0, skipped: "no-new" };
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "email, phone, phone_verified, email_alerts, sms_alerts, destination_codes",
    )
    .or("email_alerts.eq.true,sms_alerts.eq.true");

  if (error || !profiles) {
    return { emailed: 0, smsed: 0, skipped: error?.message ?? "profiles" };
  }

  const url = panelUrl();
  let emailed = 0;
  let smsed = 0;

  for (const p of profiles) {
    const mine = relevantForUser(fresh, p.destination_codes ?? []);
    if (mine.length === 0) continue;

    if (p.email_alerts && p.email) {
      const content = dealAlertEmailContent(mine, url);
      const mail = await sendEmail({
        to: p.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      if (mail.ok) emailed += 1;
    }

    if (p.sms_alerts && p.phone_verified && p.phone) {
      const text = dealAlertSmsContent(mine, url);
      const sms = await sendSms({ to: p.phone, text });
      if (sms.ok) smsed += 1;
    }
  }

  return { emailed, smsed, skipped: null };
}
